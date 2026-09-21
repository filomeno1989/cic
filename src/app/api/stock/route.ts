import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { round2 } from "@/lib/money"

class StockError extends Error {}

// POST /api/stock - entrada de mercadoria OU registo de quebra
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = await req.json()
    const { type, variantId, qty, costPrice, supplier, reason, notes } = body
    if (!variantId)
      return NextResponse.json({ error: "Produto obrigatório" }, { status: 400 })

    const variant = await db.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    })
    if (!variant) return NextResponse.json({ error: "Variação não encontrada" }, { status: 404 })

    // v2.4: AJUSTE de stock (contagem) - corrige para o valor REAL contado no armário.
    // A diferença fica registada: a mais → Entrada (mercadoria encontrada);
    // a menos → Quebra com motivo AJUSTE (nunca conta como venda).
    if (type === "AJUSTE") {
      const novoStock = parseInt(body.novoStock)
      if (novoStock == null || isNaN(novoStock) || novoStock < 0)
        return NextResponse.json({ error: "Indique a contagem real (0 ou mais)" }, { status: 400 })
      const delta = novoStock - variant.stock
      if (delta === 0)
        return NextResponse.json({ error: "A contagem é igual ao stock atual - nada a corrigir" }, { status: 400 })

      if (delta > 0) {
        // Faltava mercadoria no sistema: registra como entrada (sem fornecedor)
        await db.$transaction([
          db.stockEntry.create({
            data: { variantId, qty: delta, costPrice: variant.costPrice, supplier: null, userId: session.id },
          }),
          db.productVariant.update({ where: { id: variantId }, data: { stock: { increment: delta } } }),
        ])
        return NextResponse.json({ ok: true, direcao: "ENTRADA", delta, stock: novoStock })
      }

      // Sobrava no sistema: retira como quebra de ajuste.
      // v2.6 (D3): decremento CONDICIONAL dentro da transacção - antes a
      // verificação era lida fora e duas correções simultâneas podiam
      // negativar o stock.
      await db.$transaction(async (tx) => {
        const dec = await tx.productVariant.updateMany({
          where: { id: variantId, stock: { gte: -delta } },
          data: { stock: { decrement: -delta } },
        })
        if (dec.count === 0) throw new StockError("Contagem inválida (o stock mudou entretanto)")
        await tx.stockLoss.create({
          data: { variantId, qty: -delta, reason: "AJUSTE", notes: notes || null, userId: session.id },
        })
      })
      return NextResponse.json({ ok: true, direcao: "SAIDA", delta, stock: novoStock })
    }

    if (type === "LOSS") {
      const quantity = parseInt(qty)
      if (!quantity || quantity <= 0)
        return NextResponse.json({ error: "Quantidade válida obrigatória" }, { status: 400 })
      if (quantity > variant.stock)
        return NextResponse.json({ error: "Quebra maior que stock atual" }, { status: 400 })
      // v2.6 (D3): decremento CONDICIONAL dentro da transacção - duas quebras
      // simultâneas do último artigo: só uma passa, o stock nunca fica negativo.
      const loss = await db.$transaction(async (tx) => {
        const dec = await tx.productVariant.updateMany({
          where: { id: variantId, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        })
        if (dec.count === 0) throw new StockError("Stock insuficiente (mudou entretanto)")
        return tx.stockLoss.create({
          data: { variantId, qty: quantity, reason: reason || "OUTRO", notes: notes || null, userId: session.id },
        })
      })
      return NextResponse.json(loss)
    }

    // ENTRADA de mercadoria (compra rápida - Mukherista/Baixa/Maputo)
    const quantity = parseInt(qty)
    if (!quantity || quantity <= 0)
      return NextResponse.json({ error: "Quantidade válida obrigatória" }, { status: 400 })
    const [entry] = await db.$transaction([
      db.stockEntry.create({
        data: {
          variantId,
          qty: quantity,
          costPrice: Number(costPrice) || variant.costPrice,
          supplier: (typeof supplier === "string" ? supplier.trim() : "") || null,
          userId: session.id,
        },
      }),
      db.productVariant.update({
        where: { id: variantId },
        data: {
          stock: { increment: quantity },
          ...(Number(costPrice) > 0 && { costPrice: Number(costPrice) }),
        },
      }),
    ])
    return NextResponse.json(entry)
  } catch (e) {
    // v2.6 (D3): a corrida perdida (stock mudou entretanto) é recusa 400,
    // não erro 500 - o utilizador vê a mensagem certa e recarrega o stock.
    if (e instanceof StockError)
      return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: "Erro ao registar movimentação de stock" }, { status: 500 })
  }
}

// GET /api/stock?limit=50 - histórico de movimentações + resumo de fornecedores
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "60"), 200)
    const [entries, losses, supplierRows] = await Promise.all([
      db.stockEntry.findMany({
        orderBy: { date: "desc" }, take: limit,
        include: { variant: { include: { product: true } } },
      }),
      db.stockLoss.findMany({
        orderBy: { date: "desc" }, take: limit,
        include: { variant: { include: { product: true } } },
      }),
      // Fornecedores: agregado de TODAS as entradas (não só as últimas)
      db.stockEntry.groupBy({
        by: ["supplier"],
        where: { supplier: { not: null } },
        _count: { id: true },
        _sum: { qty: true },
        _max: { date: true },
      }),
    ])
    // total comprado por fornecedor (qty * custo da entrada) - v2.6 (D2): arredondado
    const allEntries = await db.stockEntry.findMany({ select: { supplier: true, qty: true, costPrice: true } })
    const suppliers = supplierRows
      .map((s) => {
        const name = s.supplier ?? ""
        const totalCost = round2(allEntries
          .filter((e) => e.supplier === name)
          .reduce((a, e) => a + e.qty * e.costPrice, 0))
        return {
          name,
          entries: s._count.id,
          units: s._sum.qty ?? 0,
          totalCost,
          lastDate: s._max.date,
        }
      })
      .sort((a, b) => (a.lastDate && b.lastDate ? +new Date(b.lastDate) - +new Date(a.lastDate) : 0))
    return NextResponse.json({
      entries: entries.map((e) => ({
        id: e.id, qty: e.qty, costPrice: e.costPrice, supplier: e.supplier, date: e.date,
        product: e.variant.product.name, variantLabel: [e.variant.color, e.variant.size].filter(Boolean).join(" · "),
      })),
      losses: losses.map((l) => ({
        id: l.id, qty: l.qty, reason: l.reason, notes: l.notes, date: l.date,
        product: l.variant.product.name, variantLabel: [l.variant.color, l.variant.size].filter(Boolean).join(" · "),
      })),
      suppliers,
    })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar histórico" }, { status: 500 })
  }
}
