import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"

// POST /api/customers/[id]/amortize - regista amortização da fiação
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = await req.json()
    const { amount, method, note } = body
    const value = Number(amount)
    if (!value || value <= 0) return NextResponse.json({ error: "Valor inválido" }, { status: 400 })

    const customer = await db.customer.findUnique({ where: { id } })
    if (!customer) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

    // Não permitir pagar MAIS do que o saldo - senão o saldo fica negativo
    // (cliente "a crédito"), o que estraga a conciliação da fiação.
    const [creditSales, pays] = await Promise.all([
      db.sale.findMany({
        where: { customerId: id, isCredit: true, status: "CONCLUIDA" },
        select: { payments: { select: { method: true, amount: true } } },
      }),
      db.creditPayment.aggregate({ where: { customerId: id }, _sum: { amount: true } }),
    ])
    const credited = creditSales
      .flatMap((s) => s.payments.filter((p) => p.method === "CREDITO"))
      .reduce((a, p) => a + p.amount, 0)
    const balance = credited - (pays._sum.amount ?? 0)
    if (value > balance + 0.01)
      return NextResponse.json(
        { error: `Valor maior que o saldo devedor (${balance.toFixed(2)} MT). Registe o valor exato.` },
        { status: 400 }
      )

    const payment = await db.creditPayment.create({
      data: { customerId: id, amount: value, method: method || "DINHEIRO", note: note || null, userId: session.id },
    })

    return NextResponse.json(payment)
  } catch {
    return NextResponse.json({ error: "Erro ao registar amortização" }, { status: 500 })
  }
}
