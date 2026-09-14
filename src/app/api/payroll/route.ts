import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"
import { monthRangeMZ } from "@/lib/tz"

// GET /api/payroll?month=YYYY-MM - folha: Salário + Comissões − Vales (só gerente)
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden()

    const { searchParams } = new URL(req.url)
    const monthStr = searchParams.get("month") ?? new Date().toISOString().slice(0, 7)
    const [y, m] = monthStr.split("-").map(Number)
    if (!y || !m || m < 1 || m > 12)
      return NextResponse.json({ error: "Mês inválido" }, { status: 400 })
    const { start, end } = monthRangeMZ(y, m) // limites às 00:00 de Maputo

    const users = await db.user.findMany({ where: { active: true } })
    const [sales, vales] = await Promise.all([
      db.sale.findMany({
        where: { status: "CONCLUIDA", createdAt: { gte: start, lt: end } },
        select: { userId: true, total: true, commission: true },
      }),
      db.vale.findMany({
        where: { date: { gte: start, lt: end } },
        select: { userId: true, amount: true },
      }),
    ])

    const rows = users.map((u) => {
      const mySales = sales.filter((s) => s.userId === u.id)
      const salesTotal = mySales.reduce((a, s) => a + s.total, 0)
      const commissions = mySales.reduce((a, s) => a + s.commission, 0)
      const valesTotal = vales.filter((v) => v.userId === u.id).reduce((a, v) => a + v.amount, 0)
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        baseSalary: u.baseSalary,
        commissionPct: u.commissionPct,
        salesTotal,
        commissions,
        vales: valesTotal,
        toPay: u.baseSalary + commissions - valesTotal,
      }
    })

    return NextResponse.json({ month: monthStr, rows })
  } catch {
    return NextResponse.json({ error: "Erro ao calcular folha" }, { status: 500 })
  }
}
