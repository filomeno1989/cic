import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { round2 } from "@/lib/money"

// POST /api/customers/[id]/amortize - regista amortização da fiação
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = await req.json()
    const { amount, method, note } = body
    const value = round2(Number(amount))
    if (!value || value <= 0) return NextResponse.json({ error: "Valor inválido" }, { status: 400 })

    const customer = await db.customer.findUnique({ where: { id } })
    if (!customer) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

    // v2.6 (D3 da auditoria): o saldo passou a verificar-se DENTRO de uma
    // transacção, com o UPDATE na linha do cliente como tranca. Antes lia-se
    // o saldo fora da transacção - duas amortizações simultâneas (duplo
    // clique, dois aparelhos) viam o mesmo saldo e podiam pagar MAIS do que
    // a dívida, deixando o cliente "a crédito" e estragando a conciliação.
    // Também resolve quem tem >100 registos: a soma é feita na BD (D4).
    const payment = await db.$transaction(async (tx) => {
      await tx.customer.updateMany({
        where: { id },
        data: { updatedAt: new Date() }, // só para obter a tranca da linha
      })
      const rows = await tx.$queryRaw`
        SELECT
          (SELECT COALESCE(SUM(p.amount), 0) FROM "Payment" p
            JOIN "Sale" s ON s.id = p."saleId"
            WHERE s."customerId" = ${id} AND p.method = 'CREDITO'
              AND s.status = 'CONCLUIDA' AND s."isCredit" = TRUE) AS credited,
          (SELECT COALESCE(SUM(amount), 0) FROM "CreditPayment"
            WHERE "customerId" = ${id}) AS amortized` as Array<{ credited: number; amortized: number }>
      const r = rows[0] ?? { credited: 0, amortized: 0 }
      const balance = round2(Number(r.credited) - Number(r.amortized))

      // Não permitir pagar MAIS do que o saldo - senão o saldo fica negativo
      // (cliente "a crédito"), o que estraga a conciliação da fiação.
      if (value > round2(balance + 0.01))
        throw new Error(`SALDO|Valor maior que o saldo devedor (${balance.toFixed(2)} MT). Registe o valor exato.`)

      return tx.creditPayment.create({
        data: { customerId: id, amount: value, method: method || "DINHEIRO", note: note || null, userId: session.id },
      })
    })

    return NextResponse.json(payment)
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("SALDO|"))
      return NextResponse.json({ error: e.message.slice(6) }, { status: 400 })
    return NextResponse.json({ error: "Erro ao registar amortização" }, { status: 500 })
  }
}
