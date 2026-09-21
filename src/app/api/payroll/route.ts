import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"
import { monthRangeMZ, currentMonthMZ } from "@/lib/tz"
import { round2 } from "@/lib/money"

// GET /api/payroll?month=YYYY-MM - folha: Salário + Comissões − Vales (só gerente)
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden()

    const { searchParams } = new URL(req.url)
    // v2.6 (D9): o mês por omissão vem do relógio de MAPUTO, não do UTC do
    // servidor - entre 00:00 e 01:59 de Maputo no dia 1, o UTC ainda estava
    // no mês anterior e a folha abria no mês errado.
    const monthStr = searchParams.get("month") ?? currentMonthMZ()
    const [y, m] = monthStr.split("-").map(Number)
    if (!y || !m || m < 1 || m > 12)
      return NextResponse.json({ error: "Mês inválido" }, { status: 400 })
    const { start, end } = monthRangeMZ(y, m) // limites às 00:00 de Maputo

    const users = await db.user.findMany({ where: { active: true, isSystem: false } }) // conta do proprietário (isSystem) não entra na folha
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
      // v2.6 (D2): somas arredondadas a 2 decimais
      const salesTotal = round2(mySales.reduce((a, s) => a + s.total, 0))
      const commissions = round2(mySales.reduce((a, s) => a + s.commission, 0))
      const valesTotal = round2(vales.filter((v) => v.userId === u.id).reduce((a, v) => a + v.amount, 0))
      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        baseSalary: u.baseSalary,
        commissionPct: u.commissionPct,
        salesTotal,
        commissions,
        vales: valesTotal,
        toPay: round2(u.baseSalary + commissions - valesTotal),
      }
    })

    return NextResponse.json({ month: monthStr, rows })
  } catch {
    return NextResponse.json({ error: "Erro ao calcular folha" }, { status: 500 })
  }
}
