import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"

/*
 * Backup completo dos dados da loja (só gerente).
 * GET  /api/backup  → exporta TODAS as tabelas em JSON
 * POST /api/backup  → restaura a partir de um backup (substitui tudo)
 */

const APP_TAG = "CIC-backup"

// GET - exportar
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode exportar o backup")

    const [
      settings, users, counters, products, productVariants, stockEntries,
      stockLosses, customers, creditPayments, sales, saleItems, payments,
      vales, expenses, cashClosings, productImages,
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
      db.productImage.findMany(), // v2.4: FOTOS no backup (C2 da auditoria - antes perdia-se tudo)
    ])

    const counts = {
      produtos: products.length,
      variantes: productVariants.length,
      fotos: productImages.length,
      clientes: customers.length,
      vendas: sales.length,
      despesas: expenses.length,
      funcionarios: users.length,
    }

    return NextResponse.json({
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

// POST - restaurar (substitui TODOS os dados)
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode restaurar o backup")

    const body = await req.json()
    const { backup } = body as { backup?: BackupPayload; requesterRole?: string }
    if (!backup || backup.meta?.app !== APP_TAG || !Array.isArray(backup.users) || !Array.isArray(backup.sales))
      return NextResponse.json({ error: "Ficheiro de backup inválido ou de outra aplicação" }, { status: 400 })
    const b = backup

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
      await tx.user.deleteMany({})
      await tx.settings.deleteMany({})

      // 2) repor na ordem de dependências
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

      for (const c of arr(b.counters))
        await tx.counter.create({ data: { id: s(c.id, "sale"), saleNumber: n(c.saleNumber) } })

      for (const p of arr(b.products))
        await tx.product.create({
          data: {
            id: s(p.id), code: s(p.code), name: s(p.name),
            category: s(p.category, "Geral"), brand: (p.brand as string | null) ?? null,
            imagem: (p.imagem as string | null) ?? null, // v2.4: ligação da foto NÃO se perde mais no restauro (C2)
            active: p.active !== false, createdAt: d(p.createdAt) ?? new Date(), updatedAt: new Date(),
          },
        })

      // v2.4: repor as FOTOS (base64 → Bytes) - antes o restauro apagava todas
      for (const img of arr(b.productImages))
        await tx.productImage.create({
          data: {
            id: s(img.id), productId: s(img.productId), mime: s(img.mime, "image/jpeg"),
            dados: Buffer.from(s(img.dados), "base64"),
            createdAt: d(img.createdAt) ?? new Date(), updatedAt: new Date(),
          },
        })

      for (const v of arr(b.productVariants))
        await tx.productVariant.create({
          data: {
            id: s(v.id), productId: s(v.productId),
            color: (v.color as string | null) ?? null, size: (v.size as string | null) ?? null,
            costPrice: n(v.costPrice), retailPrice: n(v.retailPrice),
            wholesalePrice: v.wholesalePrice == null ? null : n(v.wholesalePrice),
            wholesaleMinQty: n(v.wholesaleMinQty, 3),
            stock: n(v.stock), minStock: n(v.minStock, 3),
            expiryDate: d(v.expiryDate), active: v.active !== false,
            createdAt: d(v.createdAt) ?? new Date(), updatedAt: new Date(),
          },
        })

      for (const c of arr(b.customers))
        await tx.customer.create({
          data: {
            id: s(c.id), name: s(c.name), phone: (c.phone as string | null) ?? null,
            creditLimit: n(c.creditLimit), notes: (c.notes as string | null) ?? null,
            active: c.active !== false, createdAt: d(c.createdAt) ?? new Date(), updatedAt: new Date(),
          },
        })

      for (const x of arr(b.sales))
        await tx.sale.create({
          data: {
            id: s(x.id), number: n(x.number), userId: s(x.userId),
            customerId: (x.customerId as string | null) ?? null,
            subtotal: n(x.subtotal), discount: n(x.discount), total: n(x.total),
            status: s(x.status, "CONCLUIDA"), isCredit: !!x.isCredit,
            priceType: s(x.priceType, "RETALHO"), commission: n(x.commission),
            offline: !!x.offline, clientCreatedAt: d(x.clientCreatedAt),
            createdAt: d(x.createdAt) ?? new Date(), updatedAt: new Date(),
          },
        })

      for (const i of arr(b.saleItems))
        await tx.saleItem.create({
          data: {
            id: s(i.id), saleId: s(i.saleId), variantId: s(i.variantId),
            name: s(i.name), variantLabel: (i.variantLabel as string | null) ?? null,
            qty: n(i.qty), unitPrice: n(i.unitPrice), total: n(i.total),
          },
        })

      for (const p of arr(b.payments))
        await tx.payment.create({
          data: {
            id: s(p.id), saleId: s(p.saleId), method: s(p.method),
            amount: n(p.amount), change: n(p.change),
            reference: (p.reference as string | null) ?? null,
          },
        })

      for (const c of arr(b.creditPayments))
        await tx.creditPayment.create({
          data: {
            id: s(c.id), customerId: s(c.customerId), amount: n(c.amount),
            method: s(c.method, "DINHEIRO"), userId: s(c.userId),
            note: (c.note as string | null) ?? null, date: d(c.date) ?? new Date(),
          },
        })

      for (const e of arr(b.stockEntries))
        await tx.stockEntry.create({
          data: {
            id: s(e.id), variantId: s(e.variantId), qty: n(e.qty),
            costPrice: n(e.costPrice), supplier: (e.supplier as string | null) ?? null,
            userId: s(e.userId), date: d(e.date) ?? new Date(),
          },
        })

      for (const l of arr(b.stockLosses))
        await tx.stockLoss.create({
          data: {
            id: s(l.id), variantId: s(l.variantId), qty: n(l.qty),
            reason: s(l.reason), notes: (l.notes as string | null) ?? null,
            userId: s(l.userId), date: d(l.date) ?? new Date(),
          },
        })

      for (const v of arr(b.vales))
        await tx.vale.create({
          data: {
            id: s(v.id), userId: s(v.userId), amount: n(v.amount),
            reason: (v.reason as string | null) ?? null, paidOut: !!v.paidOut, date: d(v.date) ?? new Date(),
          },
        })

      for (const e of arr(b.expenses))
        await tx.expense.create({
          data: {
            id: s(e.id), category: s(e.category), description: (e.description as string | null) ?? null,
            amount: n(e.amount), userId: s(e.userId), date: d(e.date) ?? new Date(),
          },
        })

      for (const c of arr(b.cashClosings))
        await tx.cashClosing.create({
          data: {
            id: s(c.id), userId: s(c.userId),
            countedCash: n(c.countedCash), countedPos: n(c.countedPos), countedMpesa: n(c.countedMpesa),
            expectedCash: n(c.expectedCash), expectedPos: n(c.expectedPos), expectedMpesa: n(c.expectedMpesa),
            diffCash: n(c.diffCash), diffPos: n(c.diffPos), diffMpesa: n(c.diffMpesa),
            salesTotal: n(c.salesTotal), note: (c.note as string | null) ?? null, closedAt: d(c.closedAt) ?? new Date(),
          },
        })
    })

    return NextResponse.json({
      ok: true,
      message: `Backup restaurado: ${arr(b.sales).length} vendas, ${arr(b.customers).length} clientes, ${arr(b.products).length} produtos, ${arr(b.productImages).length} fotos, ${arr(b.users).length} funcionários.`,
    })
  } catch {
    return NextResponse.json({ error: "Erro ao restaurar backup - verifique se o ficheiro é válido" }, { status: 500 })
  }
}
