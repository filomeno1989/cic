import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// DELETE /api/sales/[id] - anulação (estorno) exige PIN de gerente
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const { managerPin, reason } = body
    if (!managerPin) return NextResponse.json({ error: "PIN do gerente obrigatório" }, { status: 403 })

    const manager = await db.user.findFirst({ where: { pin: String(managerPin), role: "GERENTE", active: true } })
    if (!manager) return NextResponse.json({ error: "PIN de gerente inválido" }, { status: 403 })

    const sale = await db.sale.findUnique({ where: { id }, include: { items: true } })
    if (!sale) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 })
    if (sale.status === "ANULADA") return NextResponse.json({ error: "Venda já anulada" }, { status: 400 })

    await db.$transaction([
      db.sale.update({ where: { id }, data: { status: "ANULADA", commission: 0 } }),
      // Devolve stock
      ...sale.items.map((i) =>
        db.productVariant.update({ where: { id: i.variantId }, data: { stock: { increment: i.qty } } })
      ),
    ])

    return NextResponse.json({ ok: true, reason: reason || null })
  } catch {
    return NextResponse.json({ error: "Erro ao anular venda" }, { status: 500 })
  }
}
