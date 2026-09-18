import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"

// GET /api/customers/[id] - perfil + histórico de compras + fiação
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const customer = await db.customer.findUnique({ where: { id } })
    if (!customer) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

    const [sales, pays] = await Promise.all([
      db.sale.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          items: true,
          payments: true,
          user: { select: { name: true } },
        },
      }),
      db.creditPayment.findMany({
        where: { customerId: id },
        orderBy: { date: "desc" },
        take: 100,
      }),
    ])

    const credited = sales
      .filter((s) => s.status === "CONCLUIDA" && s.isCredit)
      .flatMap((s) => s.payments.filter((p) => p.method === "CREDITO"))
      .reduce((a, p) => a + p.amount, 0)
    const amortized = pays.reduce((a, p) => a + p.amount, 0)

    return NextResponse.json({
      ...customer,
      balance: credited - amortized,
      sales: sales.map((s) => ({
        id: s.id, number: s.number, total: s.total, status: s.status,
        isCredit: s.isCredit, priceType: s.priceType, createdAt: s.createdAt,
        seller: s.user.name,
        items: s.items.map((i) => ({ name: i.name, variantLabel: i.variantLabel, qty: i.qty, total: i.total })),
      })),
      payments: pays,
    })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar cliente" }, { status: 500 })
  }
}

// PUT /api/customers/[id] - atualizar cliente (arquivar/restaurar exige gerente - validado na SESSÃO)
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json()
    const { name, phone, creditLimit, notes, active } = body
    if (active !== undefined) {
      const session = await getSessionUser(req)
      if (!session) return unauthorized()
      if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode arquivar ou restaurar clientes")
    }
    const customer = await db.customer.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(creditLimit !== undefined && { creditLimit: Number(creditLimit) || 0 }),
        ...(notes !== undefined && { notes: notes || null }),
        ...(active !== undefined && { active: !!active }),
      },
    })
    return NextResponse.json(customer)
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar cliente" }, { status: 500 })
  }
}

// DELETE /api/customers/[id] - eliminar cliente (só gerente; bloqueado se tiver histórico)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode eliminar clientes")

    const [salesCount, paysCount] = await Promise.all([
      db.sale.count({ where: { customerId: id } }),
      db.creditPayment.count({ where: { customerId: id } }),
    ])
    if (salesCount > 0 || paysCount > 0)
      return NextResponse.json(
        { error: "Este cliente tem compras/amortizações no histórico e não pode ser eliminado. Use «Arquivar» para o retirar da lista mantendo o histórico." },
        { status: 409 }
      )
    await db.customer.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao eliminar cliente" }, { status: 500 })
  }
}
