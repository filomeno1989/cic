import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"

/*
 * Backup completo dos dados da loja (só gerente).
 * GET  /api/backup[?semFotos=1] → exporta TODAS as tabelas em JSON
 * POST /api/backup { backup, incluirContas? } → restaura a partir de um backup
 *
 * v2.6 (D5 da auditoria): o restauro deixou de criar linha a linha - agora
 * insere em lotes (createMany, 400 registos por lote), uma fração do tempo.
 * O export mede o tamanho do JSON e recusa (413) antes de bater no limite
 * de resposta da Vercel, com escape ?semFotos=1.
 * v2.6 (D6): POR OMISSÃO o restauro PRESERVA as contas de funcionários e as
 * definições da loja actuais (os PINs não mudam e a sessão não fica órfã).
 * Só recria contas do backup que já não existam (necessárias para o
 * histórico). Substituir contas/definições é opt-in (incluirContas: true).
 */

const APP_TAG = "CIC-backup"
const LOTE = 400 // registos por createMany no restauro (D5)

// GET - exportar
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode exportar o backup")

    const semFotos = new URL(req.url).searchParams.get("semFotos") === "1"

    const [
      settings, users, counters, products, productVariants, stockEntries,
      stockLosses, customers, creditPayments, sales, saleItems, payments,
      vales, expenses, cashClosings,
    ] = await Promise.all([
      db.settings.findMany(),
      db.user.findMany(),
      db.counter.findMany(),
      db.product.findMany(),
      db.productVariant.findMany(),
      db.stockEntry.findMany(),
      db.stockLoss.findMany(),
      db.customer.findMany(),
      db.creditPayment.findMany(),
      db.sale.findMany(),
      db.saleItem.findMany(),
      db.payment.findMany(),
      db.vale.findMany(),
      db.expense.findMany(),
      db.cashClosing.findMany(),
    ])
    const productImages = semFotos
      ? []
      : await db.productImage.findMany() // v2.4: FOTOS no backup (C2 da auditoria)

    const counts = {
      produtos: products.length,
      variantes: productVariants.length,
      fotos: productImages.length,
      clientes: customers.length,
      vendas: sales.length,
      despesas: expenses.length,
      funcionarios: users.length,
    }

    // v2.6 (D5): serializar UMA vez para medir o tamanho real antes de
    // responder - o limite de resposta de serverless na Vercel é ~4.5MB e
    // um export cortado a meio seria um backup inútil.
    const payload = {
      meta: { app: APP_TAG, version: 2, exportedAt: new Date().toISOString(), counts },
      settings, users, counters, products,
      productVariants, stockEntries, stockLosses,
      customers, creditPayments, sales, saleItems, payments,
      vales, expenses, cashClosings,
      // Bytes → base64 para o JSON (restaurado com Buffer.from)
      productImages: productImages.map((img) => ({
        id: img.id, productId: img.productId, mime: img.mime,
        dados: Buffer.from(img.dados).toString("base64"),
        createdAt: img.createdAt,
      })),
    }
    const json = JSON.stringify(payload)
    if (json.length > 4_000_000) {
      return NextResponse.json(
        {
          error: semFotos
            ? "O backup é demasiado grande para exportar numa peça (mesmo sem fotos). Contacte o IT - Manutenção (export por partes)."
            : "O backup é demasiado grande para exportar numa peça (fotos + histórico). Tente «Exportar sem fotos» - se mesmo assim falhar, contacte o IT - Manutenção.",
          demasiadoGrande: true,
        },
        { status: 413 }
      )
    }
    return new NextResponse(json, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    })
  } catch {
    return NextResponse.json({ error: "Erro ao exportar backup" }, { status: 500 })
  }
}

type BackupPayload = {
  meta?: { app?: string; version?: number }
  settings?: unknown; users?: unknown; counters?: unknown
  products?: unknown; productVariants?: unknown
  stockEntries?: unknown; stockLosses?: unknown
  customers?: unknown; creditPayments?: unknown
  sales?: unknown; saleItems?: unknown; payments?: unknown
  vales?: unknown; expenses?: unknown; cashClosings?: unknown
  productImages?: unknown
}

const d = (v: unknown): Date | null => (v ? new Date(v as string) : null)
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? (x as Record<string, unknown>[]) : [])
const s = (v: unknown, fb = ""): string => (v == null ? fb : String(v))
const n = (v: unknown, fb = 0): number => (Number.isFinite(Number(v)) ? Number(v) : fb)

// D5: insere a lista em lotes com createMany (rápido) em vez de create
// linha a linha (lento - excedia o tempo da função com muitas vendas).
async function emLotes<X, T>(
  lista: X[],
  mapear: (x: X) => T,
  criarLote: (dados: T[]) => Promise<unknown>
) {
  for (let i = 0; i < lista.length; i += LOTE) {
    await criarLote(lista.slice(i, i + LOTE).map(mapear))
  }
}

// POST - restaurar
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode restaurar o backup")

    const body = await req.json()
    const { backup, incluirContas } = body as { backup?: BackupPayload; incluirContas?: boolean }
    if (!backup || backup.meta?.app !== APP_TAG || !Array.isArray(backup.users) || !Array.isArray(backup.sales))
      return NextResponse.json({ error: "Ficheiro de backup inválido ou de outra aplicação" }, { status: 400 })
    const b = backup
    const substituirContas = incluirContas === true // v2.6 (D6): por omissão PRESERVA

    let contasPreservadas = 0
    let contasRecriadas = 0

    await db.$transaction(async (tx) => {
      // 1) apagar na ordem inversa de dependências
      await tx.productImage.deleteMany({}) // v2.4: fotos também são repostas
      await tx.creditPayment.deleteMany({})
      await tx.payment.deleteMany({})
      await tx.saleItem.deleteMany({})
      await tx.sale.deleteMany({})
      await tx.stockEntry.deleteMany({})
      await tx.stockLoss.deleteMany({})
      await tx.productVariant.deleteMany({})
      await tx.product.deleteMany({})
      await tx.customer.deleteMany({})
      await tx.vale.deleteMany({})
      await tx.expense.deleteMany({})
      await tx.cashClosing.deleteMany({})
      await tx.counter.deleteMany({})
      if (substituirContas) {
        await tx.user.deleteMany({})
        await tx.settings.deleteMany({})
      }

      // 2) repor na ordem de dependências

      // v2.6 (D6): contas - substituir (opt-in) OU preservar com recriação
      // das que faltam (o histórico de vendas aponta para o userId - sem
      // elas o restauro quebraria nas chaves estrangeiras).
      if (substituirContas) {
        for (const x of arr(b.settings))
          await tx.settings.create({
            data: {
              id: s(x.id, "main"), storeName: s(x.storeName, "CIC Fragrâncias & Glamour"),
              phone: s(x.phone), address: s(x.address, "Beira, Moçambique"),
              receiptFooter: s(x.receiptFooter, "Obrigado pela preferência!"), thermalWidth: s(x.thermalWidth, "80"),
              nuit: s(x.nuit),
              whatsappLoja: s(x.whatsappLoja),
              instagramUrl: s(x.instagramUrl), facebookUrl: s(x.facebookUrl), tiktokUrl: s(x.tiktokUrl),
              expenseCategories: s(x.expenseCategories),
              productCategories: s(x.productCategories),
              productBrands: s(x.productBrands),
            },
          })

        for (const u of arr(b.users))
          await tx.user.create({
            data: {
              id: s(u.id), name: s(u.name),
              // v2.5 (S5): backups novos trazem pinHash+pinLookup (PIN nunca em texto).
              // Backups antigos (só com pin em texto) restauram como legado - o login
              // continua a aceitá-los até o PIN ser alterado nas Definições.
              ...(u.pinHash
                ? { pin: "", pinHash: s(u.pinHash), pinLookup: (u.pinLookup as string) || null }
                : { pin: s(u.pin) }),
              role: u.role === "GERENTE" ? "GERENTE" : "CAIXA",
              active: u.active !== false, isSystem: u.isSystem === true,
              phone: (u.phone as string | null) ?? null,
              baseSalary: n(u.baseSalary), commissionPct: n(u.commissionPct),
              createdAt: d(u.createdAt) ?? new Date(), updatedAt: new Date(),
            },
          })
      } else {
        // PRESERVAR: as contas actuais ficam (PINs actuais mantidos - a
        // sessão aberta não fica órfã). Só recria contas do backup que já
        // não existam, DESACTIVADAS (só para o histórico não quebrar).
        const actuais = await tx.user.findMany({ select: { id: true } })
        const idsActuais = new Set(actuais.map((u) => u.id))
        contasPreservadas = idsActuais.size
        for (const u of arr(b.users)) {
          if (idsActuais.has(s(u.id))) continue
          await tx.user.create({
            data: {
              id: s(u.id), name: s(u.name),
              ...(u.pinHash
                ? { pin: "", pinHash: s(u.pinHash), pinLookup: null } // pinLookup actual pode colidir - fica sem acesso por código
                : { pin: s(u.pin) }),
              role: u.role === "GERENTE" ? "GERENTE" : "CAIXA",
              active: false, // conta recriada só para histórico: sem acesso
              isSystem: u.isSystem === true,
              phone: (u.phone as string | null) ?? null,
              baseSalary: n(u.baseSalary), commissionPct: n(u.commissionPct),
              createdAt: d(u.createdAt) ?? new Date(), updatedAt: new Date(),
            },
          })
          contasRecriadas++
        }
      }

      for (const c of arr(b.counters))
        await tx.counter.create({ data: { id: s(c.id, "sale"), saleNumber: n(c.saleNumber) } })

      await emLotes(arr(b.products), (p) => ({
        id: s(p.id), code: s(p.code), name: s(p.name),
        category: s(p.category, "Geral"), brand: (p.brand as string | null) ?? null,
        imagem: (p.imagem as string | null) ?? null, // v2.4: ligação da foto NÃO se perde mais no restauro (C2)
        active: p.active !== false, createdAt: d(p.createdAt) ?? new Date(), updatedAt: new Date(),
      }), (lote) => tx.product.createMany({ data: lote }))

      // v2.4: repor as FOTOS (base64 → Bytes) - antes o restauro apagava todas
      await emLotes(arr(b.productImages), (img) => ({
        id: s(img.id), productId: s(img.productId), mime: s(img.mime, "image/jpeg"),
        dados: Buffer.from(s(img.dados), "base64"),
        createdAt: d(img.createdAt) ?? new Date(), updatedAt: new Date(),
      }), (lote) => tx.productImage.createMany({ data: lote }))

      await emLotes(arr(b.productVariants), (v) => ({
        id: s(v.id), productId: s(v.productId),
        color: (v.color as string | null) ?? null, size: (v.size as string | null) ?? null,
        costPrice: n(v.costPrice), retailPrice: n(v.retailPrice),
        wholesalePrice: v.wholesalePrice == null ? null : n(v.wholesalePrice),
        wholesaleMinQty: n(v.wholesaleMinQty, 3),
        stock: n(v.stock), minStock: n(v.minStock, 3),
        expiryDate: d(v.expiryDate), active: v.active !== false,
        createdAt: d(v.createdAt) ?? new Date(), updatedAt: new Date(),
      }), (lote) => tx.productVariant.createMany({ data: lote }))

      await emLotes(arr(b.customers), (c) => ({
        id: s(c.id), name: s(c.name), phone: (c.phone as string | null) ?? null,
        creditLimit: n(c.creditLimit), notes: (c.notes as string | null) ?? null,
        active: c.active !== false, createdAt: d(c.createdAt) ?? new Date(), updatedAt: new Date(),
      }), (lote) => tx.customer.createMany({ data: lote }))

      await emLotes(arr(b.sales), (x) => ({
        id: s(x.id), number: n(x.number), userId: s(x.userId),
        customerId: (x.customerId as string | null) ?? null,
        subtotal: n(x.subtotal), discount: n(x.discount), total: n(x.total),
        status: s(x.status, "CONCLUIDA"), isCredit: !!x.isCredit,
        priceType: s(x.priceType, "RETALHO"), commission: n(x.commission),
        offline: !!x.offline, clientCreatedAt: d(x.clientCreatedAt),
        createdAt: d(x.createdAt) ?? new Date(), updatedAt: new Date(),
      }), (lote) => tx.sale.createMany({ data: lote }))

      await emLotes(arr(b.saleItems), (i) => ({
        id: s(i.id), saleId: s(i.saleId), variantId: s(i.variantId),
        name: s(i.name), variantLabel: (i.variantLabel as string | null) ?? null,
        qty: n(i.qty), unitPrice: n(i.unitPrice), total: n(i.total),
      }), (lote) => tx.saleItem.createMany({ data: lote }))

      await emLotes(arr(b.payments), (p) => ({
        id: s(p.id), saleId: s(p.saleId), method: s(p.method),
        amount: n(p.amount), change: n(p.change),
        reference: (p.reference as string | null) ?? null,
      }), (lote) => tx.payment.createMany({ data: lote }))

      await emLotes(arr(b.creditPayments), (c) => ({
        id: s(c.id), customerId: s(c.customerId), amount: n(c.amount),
        method: s(c.method, "DINHEIRO"), userId: s(c.userId),
        note: (c.note as string | null) ?? null, date: d(c.date) ?? new Date(),
      }), (lote) => tx.creditPayment.createMany({ data: lote }))

      await emLotes(arr(b.stockEntries), (e) => ({
        id: s(e.id), variantId: s(e.variantId), qty: n(e.qty),
        costPrice: n(e.costPrice), supplier: (e.supplier as string | null) ?? null,
        userId: s(e.userId), date: d(e.date) ?? new Date(),
      }), (lote) => tx.stockEntry.createMany({ data: lote }))

      await emLotes(arr(b.stockLosses), (l) => ({
        id: s(l.id), variantId: s(l.variantId), qty: n(l.qty),
        reason: s(l.reason), notes: (l.notes as string | null) ?? null,
        userId: s(l.userId), date: d(l.date) ?? new Date(),
      }), (lote) => tx.stockLoss.createMany({ data: lote }))

      await emLotes(arr(b.vales), (v) => ({
        id: s(v.id), userId: s(v.userId), amount: n(v.amount),
        reason: (v.reason as string | null) ?? null, paidOut: !!v.paidOut, date: d(v.date) ?? new Date(),
      }), (lote) => tx.vale.createMany({ data: lote }))

      await emLotes(arr(b.expenses), (e) => ({
        id: s(e.id), category: s(e.category), description: (e.description as string | null) ?? null,
        amount: n(e.amount), userId: s(e.userId), date: d(e.date) ?? new Date(),
      }), (lote) => tx.expense.createMany({ data: lote }))

      await emLotes(arr(b.cashClosings), (c) => ({
        id: s(c.id), userId: s(c.userId),
        countedCash: n(c.countedCash), countedPos: n(c.countedPos), countedMpesa: n(c.countedMpesa),
        expectedCash: n(c.expectedCash), expectedPos: n(c.expectedPos), expectedMpesa: n(c.expectedMpesa),
        diffCash: n(c.diffCash), diffPos: n(c.diffPos), diffMpesa: n(c.diffMpesa),
        salesTotal: n(c.salesTotal), note: (c.note as string | null) ?? null, closedAt: d(c.closedAt) ?? new Date(),
      }), (lote) => tx.cashClosing.createMany({ data: lote }))
    })

    return NextResponse.json({
      ok: true,
      message: substituirContas
        ? `Backup restaurado: ${arr(b.sales).length} vendas, ${arr(b.customers).length} clientes, ${arr(b.products).length} produtos, ${arr(b.productImages).length} fotos. Contas e definições substituídas pelas do backup.`
        : `Backup restaurado: ${arr(b.sales).length} vendas, ${arr(b.customers).length} clientes, ${arr(b.products).length} produtos, ${arr(b.productImages).length} fotos. Contas preservadas (${contasRecriadas} recriadas para o histórico) e definições da loja mantidas.`,
    })
  } catch {
    return NextResponse.json({ error: "Erro ao restaurar backup - verifique se o ficheiro é válido" }, { status: 500 })
  }
}
