import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { bloqueado, segundosRestantes, registarFalha, registarSucesso, ipDoPedido, MSG_BLOQUEIO } from "@/lib/ratelimit"
import { pinConfere } from "@/lib/pin"

type ItemIn = { variantId: string; qty: number; unitPrice: number }
type PayIn = { method: string; amount: number; change?: number; reference?: string }

class StockError extends Error {}
class AutorizacaoError extends Error {}

// v2.5 (S5 da auditoria): valida PIN de gerente com bloqueio de tentativas.
// Usado no desconto >10% quando a sessão não é de gerente.
async function pinGerenteValido(req: NextRequest, pin: unknown): Promise<boolean> {
  const ip = ipDoPedido(req)
  if (bloqueado("venda-desconto", ip)) return false
  if (!pin || typeof pin !== "string") return false
  const gerentes = await db.user.findMany({
    where: { role: "GERENTE", active: true },
    select: { pinHash: true, pin: true },
  })
  const ok = gerentes.some((g) => pinConfere(pin, g))
  if (ok) registarSucesso("venda-desconto", ip)
  else registarFalha("venda-desconto", ip)
  return ok
}

// GET /api/sales?limit=100&from=ISO&to=ISO - lista vendas (filtros p/ relatórios)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 1000)
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const sales = await db.sale.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      where: {
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        user: { select: { name: true } },
        customer: { select: { name: true, phone: true } },
        items: true,
        payments: true,
      },
    })
    return NextResponse.json(sales)
  } catch {
    return NextResponse.json({ error: "Erro ao carregar vendas" }, { status: 500 })
  }
}

// POST /api/sales - cria venda (online ou sincronizada do offline).
// O vendedor vem SEMPRE da sessão (cookie assinado) - não é falsificável.
export async function POST(req: NextRequest) {
  let idLocal: string | null = null // visível no catch p/ corridas de replay
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = await req.json()
    const {
      customerId, items, payments, discount, priceType,
      offline, clientCreatedAt, localId, gerentePin,
    }: {
      userId?: string; customerId?: string | null
      items: ItemIn[]; payments: PayIn[]
      discount?: number; priceType?: string
      offline?: boolean; clientCreatedAt?: string; localId?: string
      gerentePin?: string
    } = body
    const userId = session.id

    // v2.4 - IDEMPOTÊNCIA (crítico C1 da auditoria): o aparelho gera um localId
    // para cada venda. Se a resposta se perdeu na rede (fundo típico Vodacom) a
    // sincronização reenvia - ANTES isto duplicava venda + stock + comissão.
    // Agora: mesmo localId devolve a MESMA venda, sem criar de novo.
    const idLocalNovo = typeof localId === "string" && localId.length > 3 ? localId.slice(0, 80) : null
    idLocal = idLocalNovo
    if (idLocalNovo) {
      const duplicada = await db.sale.findUnique({ where: { localId: idLocalNovo } })
      if (duplicada) {
        const completa = await db.sale.findUnique({
          where: { id: duplicada.id },
          include: {
            items: true, payments: true,
            customer: { select: { name: true, phone: true } },
            user: { select: { name: true } },
          },
        })
        return NextResponse.json(completa ?? duplicada, { status: 200 })
      }
    }

    if (!items?.length || !payments?.length)
      return NextResponse.json({ error: "Venda incompleta" }, { status: 400 })

    // Limpeza dos pagamentos (evita valores negativos/NaN gravados)
    const cleanPayments = payments
      .map((p) => ({
        method: String(p.method),
        amount: Math.max(0, Number(p.amount) || 0),
        change: Math.max(0, Number(p.change) || 0),
        reference: p.reference || null,
      }))
      .filter((p) => p.amount > 0)
    if (!cleanPayments.length)
      return NextResponse.json({ error: "Pagamentos inválidos" }, { status: 400 })

    // v2.5 (S3 da auditoria): o preço vem SEMPRE da base de dados - o valor
    // enviado pelo aparelho é ignorado. Um cliente alterado, ou uma venda
    // editada no localStorage, não consegue gravar preços falsos.
    // Regra idêntica à do PDV: grosso só se existir preço grosso E qty >= mínimo.
    const precos = new Map<string, { preco: number; nome: string }>()
    for (const item of items) {
      const qty = Math.max(0, Math.floor(Number(item.qty) || 0))
      const v = await db.productVariant.findUnique({
        where: { id: item.variantId },
        select: {
          color: true, size: true, retailPrice: true,
          wholesalePrice: true, wholesaleMinQty: true,
          product: { select: { name: true } },
        },
      })
      if (!v)
        return NextResponse.json({ error: "Artigo da venda não encontrado (variante removida?)" }, { status: 400 })
      const preco =
        priceType === "GROSSO" && v.wholesalePrice && qty >= v.wholesaleMinQty
          ? v.wholesalePrice
          : v.retailPrice
      precos.set(item.variantId, { preco, nome: v.product.name })
    }
    const subtotal = items.reduce(
      (a, i) => a + (precos.get(i.variantId)?.preco ?? 0) * (Math.max(0, Math.floor(Number(i.qty) || 0))),
      0
    )
    // Desconto: nunca negativo, nunca acima do subtotal (venda fantasma a 0 MT)
    const desconto = Math.min(Math.max(0, Number(discount) || 0), subtotal)
    // v2.5 (S3): desconto >10% exige gerente na sessão OU PIN de gerente válido
    // (o mesmo PIN validado no ecrã - agora confirmado NO SERVIDOR, com
    // bloqueio de tentativas). A sessão de caixa sozinha não autoriza.
    const pctDesconto = subtotal > 0 ? (desconto / subtotal) * 100 : 0
    if (pctDesconto > 10.001 && session.role !== "GERENTE") {
      const valido = await pinGerenteValido(req, gerentePin)
      if (!valido) {
        const ip = ipDoPedido(req)
        if (bloqueado("venda-desconto", ip))
          return NextResponse.json(
            { error: `${MSG_BLOQUEIO} (${Math.ceil(segundosRestantes("venda-desconto", ip) / 60)} min)` },
            { status: 429 }
          )
        throw new AutorizacaoError("Desconto acima de 10% requer autorização do gerente (PIN).")
      }
    }
    const total = Math.max(0, subtotal - desconto)
    const paidTotal = cleanPayments.reduce((a, p) => a + p.amount, 0)
    if (paidTotal + 0.01 < total)
      return NextResponse.json({ error: "Pagamentos insuficientes para o total" }, { status: 400 })

    // Fiação exige cliente
    const hasCredit = cleanPayments.some((p) => p.method === "CREDITO")
    let customer: { name: string; creditLimit: number } | null = null
    if (hasCredit) {
      if (!customerId) return NextResponse.json({ error: "Fiação exige cliente registado" }, { status: 400 })
      customer = await db.customer.findUnique({ where: { id: customerId } })
      if (!customer) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

      // Verifica limite de crédito (saldo atual + novo crédito)
      const [creditSales, pays] = await Promise.all([
        db.sale.findMany({
          where: { customerId, isCredit: true, status: "CONCLUIDA" },
          select: { payments: { select: { method: true, amount: true } } },
        }),
        db.creditPayment.aggregate({
          where: { customerId }, _sum: { amount: true },
        }),
      ])
      const credited = creditSales.flatMap((s) => s.payments.filter((p) => p.method === "CREDITO")).reduce((a, p) => a + p.amount, 0)
      const amortized = pays._sum.amount ?? 0
      const balance = credited - amortized
      const newCredit = cleanPayments.filter((p) => p.method === "CREDITO").reduce((a, p) => a + p.amount, 0)
      if (customer.creditLimit > 0 && balance + newCredit > customer.creditLimit)
        return NextResponse.json(
          { error: `Limite de fiação excedido! ${customer.name} deve ${(balance).toFixed(2)} MT, limite ${customer.creditLimit.toFixed(2)} MT.` },
          { status: 400 }
        )
    }

    // Comissão do vendedor
    const seller = await db.user.findUnique({ where: { id: userId } })
    const commission = seller ? (total * seller.commissionPct) / 100 : 0

    // Criação atómica: contador + venda + baixa de stock NA MESMA transacção.
    // A baixa usa updateMany condicional (stock >= qty) - impossível ficar negativa
    // mesmo com duas vendas simultâneas do mesmo artigo.
    const sale = await db.$transaction(async (tx) => {
      // Valida stock com bloqueio lógico (condição no update)
      for (const item of items) {
        const qty = Math.max(0, Math.floor(Number(item.qty) || 0))
        if (qty <= 0) throw new StockError("Quantidade inválida")
        const dec = await tx.productVariant.updateMany({
          where: { id: item.variantId, stock: { gte: qty } },
          data: { stock: { decrement: qty } },
        })
        if (dec.count === 0) {
          const v = await tx.productVariant.findUnique({ where: { id: item.variantId } })
          throw new StockError(`Stock insuficiente para ${v?.color ?? v?.size ?? "produto"} (disp: ${v?.stock ?? 0})`)
        }
      }

      const counter = await tx.counter.upsert({
        where: { id: "sale" },
        update: { saleNumber: { increment: 1 } },
        create: { id: "sale", saleNumber: 1 },
      })

      const created = await tx.sale.create({
        data: {
          number: counter.saleNumber,
          localId: idLocalNovo,
          userId,
          customerId: customerId || null,
          subtotal,
          discount: desconto,
          total,
          isCredit: hasCredit,
          priceType: priceType === "GROSSO" ? "GROSSO" : "RETALHO",
          commission,
          offline: !!offline,
          clientCreatedAt: clientCreatedAt ? new Date(clientCreatedAt) : null,
          items: {
            create: await Promise.all(
              items.map(async (i) => {
                const v = await tx.productVariant.findUniqueOrThrow({
                  where: { id: i.variantId }, include: { product: true },
                })
                const unitario = precos.get(i.variantId)?.preco ?? 0 // v2.5 (S3): preço da BD, não do cliente
                return {
                  variantId: i.variantId,
                  name: v.product.name,
                  variantLabel: [v.color, v.size].filter(Boolean).join(" · ") || null,
                  qty: Math.floor(Number(i.qty) || 0),
                  unitPrice: unitario,
                  total: unitario * (Math.floor(Number(i.qty) || 0)),
                }
              })
            ),
          },
          payments: {
            create: cleanPayments.map((p) => ({
              method: p.method,
              amount: p.amount,
              change: p.change,
              reference: p.reference,
            })),
          },
        },
        include: {
          items: true, payments: true,
          customer: { select: { name: true, phone: true } },
          user: { select: { name: true } },
        },
      })
      return created
    })

    return NextResponse.json(sale)
  } catch (e) {
    if (e instanceof StockError)
      return NextResponse.json({ error: e.message }, { status: 400 })
    if (e instanceof AutorizacaoError)
      return NextResponse.json({ error: e.message }, { status: 403 })
    // Corrida entre dois replays do mesmo localId: o segundo bate no índice único
    // → devolve a venda já gravada em vez de erro 500.
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002" && idLocal) {
      const existente = await db.sale.findUnique({
        where: { localId: idLocal },
        include: {
          items: true, payments: true,
          customer: { select: { name: true, phone: true } },
          user: { select: { name: true } },
        },
      }).catch(() => null)
      if (existente) return NextResponse.json(existente, { status: 200 })
    }
    return NextResponse.json({ error: "Erro ao processar venda" }, { status: 500 })
  }
}
