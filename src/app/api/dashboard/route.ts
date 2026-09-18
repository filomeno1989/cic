import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { startOfDayMZ, startOfTodayMZ } from "@/lib/tz"

// GET /api/dashboard - KPIs + alertas (validade, stock, devedores).
// O papel (GERENTE/CAIXA) e o userId vêm da SESSÃO - o caixa nunca
// vê lucro nem vendas dos colegas, mesmo manipulando a URL.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    const isManager = session.role === "GERENTE"
    const userId = session.id

    const startOfDay = startOfTodayMZ()
    const daysAgo7 = startOfDayMZ(-6)

    const [todaySales, weekSales, variants, creditSales, amortizations, todayExpenses, todayAmorts] =
      await Promise.all([
        db.sale.findMany({
          where: {
            status: "CONCLUIDA",
            createdAt: { gte: startOfDay },
            ...(isManager ? {} : { userId }),
          },
          include: { payments: true, items: { include: { variant: { select: { costPrice: true } } } }, user: { select: { name: true } } },
        }),
        db.sale.findMany({
          where: { status: "CONCLUIDA", createdAt: { gte: daysAgo7 } },
          select: { createdAt: true, total: true },
        }),
        db.productVariant.findMany({
          where: { active: true },
          select: {
            id: true, stock: true, minStock: true, expiryDate: true,
            color: true, size: true, costPrice: true, product: { select: { name: true } },
          },
        }),
        db.sale.findMany({
          where: { isCredit: true, status: "CONCLUIDA" },
          select: { customerId: true, customer: { select: { name: true } }, payments: { where: { method: "CREDITO" }, select: { amount: true } } },
        }),
        db.creditPayment.findMany({ select: { customerId: true, amount: true } }),
        db.expense.findMany({
          where: { date: { gte: startOfDay }, ...(isManager ? {} : { userId }) },
          select: { amount: true, category: true },
        }),
        db.creditPayment.findMany({
          where: { date: { gte: startOfDay }, ...(isManager ? {} : { userId }) },
          select: { amount: true, method: true },
        }),
      ])

    // KPIs de hoje
    const todayTotal = todaySales.reduce((a, s) => a + s.total, 0)
    const todayCount = todaySales.length
    const todayCash = todaySales.flatMap((s) => s.payments).filter((p) => p.method === "DINHEIRO").reduce((a, p) => a + (p.amount - p.change), 0)
    const todayMobile = todaySales.flatMap((s) => s.payments).filter((p) => ["MPESA", "EMOLA", "MKESH"].includes(p.method)).reduce((a, p) => a + p.amount, 0)
    const todayPos = todaySales.flatMap((s) => s.payments).filter((p) => p.method === "POS").reduce((a, p) => a + p.amount, 0)
    const todayCredit = todaySales.flatMap((s) => s.payments).filter((p) => p.method === "CREDITO").reduce((a, p) => a + p.amount, 0)
    const expenseTotal = todayExpenses.reduce((a, e) => a + e.amount, 0)
    const amortTotal = todayAmorts.reduce((a, p) => a + p.amount, 0)

    // Lucro (apenas gerente): vendas − custo das mercadorias − despesas
    let todayProfit: number | null = null
    if (isManager) {
      const cost = todaySales.flatMap((s) => s.items).reduce((a, i) => a + i.variant.costPrice * i.qty, 0)
      todayProfit = todayTotal - cost - expenseTotal
    }

    // Gráfico 7 dias
    const chart: Array<{ day: string; total: number }> = []
    for (let i = 6; i >= 0; i--) {
      const d = startOfDayMZ(-i)
      const next = startOfDayMZ(-i + 1)
      const total = weekSales
        .filter((s) => s.createdAt >= d && s.createdAt < next)
        .reduce((a, s) => a + s.total, 0)
      chart.push({ day: d.toLocaleDateString("pt-PT", { weekday: "short", timeZone: "Africa/Maputo" }), total })
    }

    // Alertas de validade (30/60/90 dias)
    const now = Date.now()
    const expiring = variants
      .filter((v) => v.expiryDate)
      .map((v) => ({
        product: v.product.name,
        variantLabel: [v.color, v.size].filter(Boolean).join(" · "),
        expiryDate: v.expiryDate!,
        days: Math.ceil((new Date(v.expiryDate!).getTime() - now) / 86400000),
        stock: v.stock,
      }))
      .filter((v) => v.days <= 90)
      .sort((a, b) => a.days - b.days)

    // Stock baixo
    const lowStock = variants
      .filter((v) => v.stock <= v.minStock)
      .map((v) => ({
        product: v.product.name,
        variantLabel: [v.color, v.size].filter(Boolean).join(" · "),
        stock: v.stock,
        minStock: v.minStock,
      }))

    // Devedores (fiação)
    const byCustomer = new Map<string, { name: string; owed: number }>()
    for (const s of creditSales) {
      if (!s.customerId) continue
      const owed = s.payments.reduce((a, p) => a + p.amount, 0)
      const cur = byCustomer.get(s.customerId) ?? { name: s.customer?.name ?? "", owed: 0 }
      cur.owed += owed
      byCustomer.set(s.customerId, cur)
    }
    for (const a of amortizations) {
      const cur = byCustomer.get(a.customerId)
      if (cur) cur.owed -= a.amount
    }
    const debtors = [...byCustomer.entries()]
      .map(([id, v]) => ({ id, name: v.name, balance: v.owed }))
      .filter((d) => d.balance > 0.009)
      .sort((a, b) => b.balance - a.balance)
    const debtTotal = debtors.reduce((a, d) => a + d.balance, 0)

    return NextResponse.json({
      today: {
        total: todayTotal, count: todayCount,
        cash: todayCash, mobile: todayMobile, pos: todayPos, credit: todayCredit,
        expenses: expenseTotal, amortizations: amortTotal,
        profit: todayProfit,
      },
      chart,
      expiring: expiring.slice(0, 10),
      lowStock: lowStock.slice(0, 10),
      debtors: debtors.slice(0, 8),
      debtTotal,
    })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar painel" }, { status: 500 })
  }
}
