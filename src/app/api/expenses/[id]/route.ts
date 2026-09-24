import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"

// DELETE /api/expenses/[id] - eliminar despesa registada por engano (só gerente)
// v2.4: antes a despesa registada errada ficava para sempre e o fecho do caixa ficava torto.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode eliminar despesas")
    const { id } = await ctx.params
    await db.expense.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao eliminar despesa" }, { status: 500 })
  }
}
