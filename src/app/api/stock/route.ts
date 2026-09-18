import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"

// POST /api/stock - entrada de mercadoria OU registo de quebra
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = await req.json()
    const { type, variantId, qty, costPrice, supplier, reason, notes } = body
    const quantity = parseInt(qty)
    if (!variantId || !quantity || quantity <= 0)
      return NextResponse.json({ error: "Produto e quantidade válidos obrigatórios" }, { status: 400 })

    const variant = await db.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    })
    if (!variant) return NextResponse.json({ error: "Variação não encontrada" }, { status: 404 })

    if (type === "LOSS") {
      if (quantity > variant.stock)
        return NextResponse.json({ error: "Quebra maior que stock atual" }, { status: 400 })
      const [loss] = await db.$transaction([
        db.stockLoss.create({
          data: { variantId, qty: quantity, reason: reason || "OUTRO", notes: notes || null, userId: session.id },
        }),
        db.productVariant.update({ where: { id: variantId }, data: { stock: { decrement: quantity } } }),
      ])
      return NextResponse.json(loss)
    }

    // ENTRADA de mercadoria (compra rápida - Mukherista/Baixa/Maputo)
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
  } catch {
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
    // total comprado por fornecedor (qty * custo da entrada)
    const allEntries = await db.stockEntry.findMany({ select: { supplier: true, qty: true, costPrice: true } })
    const suppliers = supplierRows
      .map((s) => {
        const name = s.supplier ?? ""
        const totalCost = allEntries
          .filter((e) => e.supplier === name)
          .reduce((a, e) => a + e.qty * e.costPrice, 0)
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
