import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { startOfDayMZ, startOfTodayMZ } from "@/lib/tz"
import { round2 } from "@/lib/money"

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

    const [todaySales, weekSales, variants, todayExpenses, todayAmorts, creditedRows, amortizedRows] =
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
        db.expense.findMany({
          where: { date: { gte: startOfDay }, ...(isManager ? {} : { userId }) },
          select: { amount: true, category: true },
        }),
        db.creditPayment.findMany({
          where: { date: { gte: startOfDay }, ...(isManager ? {} : { userId }) },
          select: { amount: true, method: true },
        }),
        // v2.6 (D4 da auditoria): devedores agregados NA BASE DE DADOS.
        // Antes carregava TODA a história de vendas a crédito + TODAS as
        // amortizações e somava em JavaScript - com anos de fiação a página
        // ficava lenta. Agora: duas somas SQL por cliente (linhas = nº de
        // clientes, não nº de vendas). Igual em Postgres e SQLite.
        db.$queryRaw<Array<{ cid: string; name: string; credited: number }>>`
          SELECT s."customerId" AS cid, c.name AS name, COALESCE(SUM(p.amount), 0) AS credited
          FROM "Payment" p
          JOIN "Sale" s ON s.id = p."saleId"
          JOIN "Customer" c ON c.id = s."customerId"
          WHERE p.method = 'CREDITO' AND s.status = 'CONCLUIDA' AND s."isCredit" = TRUE
            AND s."customerId" IS NOT NULL
          GROUP BY s."customerId", c.name`,
        db.creditPayment.groupBy({
          by: ["customerId"],
          _sum: { amount: true },
        }),
      ])

    // KPIs de hoje (v2.6 D2: tudo arredondado a 2 decimais)
    const todayTotal = round2(todaySales.reduce((a, s) => a + s.total, 0))
    const todayCount = todaySales.length
    const todayCash = round2(todaySales.flatMap((s) => s.payments).filter((p) => p.method === "DINHEIRO").reduce((a, p) => a + (p.amount - p.change), 0))
    const todayMobile = round2(todaySales.flatMap((s) => s.payments).filter((p) => ["MPESA", "EMOLA", "MKESH"].includes(p.method)).reduce((a, p) => a + p.amount, 0))
    const todayPos = round2(todaySales.flatMap((s) => s.payments).filter((p) => p.method === "POS").reduce((a, p) => a + p.amount, 0))
    const todayCredit = round2(todaySales.flatMap((s) => s.payments).filter((p) => p.method === "CREDITO").reduce((a, p) => a + p.amount, 0))
    const expenseTotal = round2(todayExpenses.reduce((a, e) => a + e.amount, 0))
    const amortTotal = round2(todayAmorts.reduce((a, p) => a + p.amount, 0))

    // Lucro (apenas gerente): vendas − custo das mercadorias − despesas
    let todayProfit: number | null = null
    if (isManager) {
      const cost = round2(todaySales.flatMap((s) => s.items).reduce((a, i) => a + i.variant.costPrice * i.qty, 0))
      todayProfit = round2(todayTotal - cost - expenseTotal)
    }

    // Gráfico 7 dias
    const chart: Array<{ day: string; total: number }> = []
    for (let i = 6; i >= 0; i--) {
      const d = startOfDayMZ(-i)
      const next = startOfDayMZ(-i + 1)
      const total = round2(weekSales
        .filter((s) => s.createdAt >= d && s.createdAt < next)
        .reduce((a, s) => a + s.total, 0))
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

    // Devedores (fiação) - agregado na BD (v2.6 D4), arredondado (D2)
    const byCustomer = new Map<string, { name: string; owed: number }>()
    for (const r of creditedRows) {
      if (!r.cid) continue
      byCustomer.set(r.cid, { name: r.name, owed: round2(Number(r.credited)) })
    }
    for (const a of amortizedRows) {
      const cur = byCustomer.get(a.customerId)
      if (cur) cur.owed = round2(cur.owed - (a._sum.amount ?? 0))
    }
    const debtors = [...byCustomer.entries()]
      .map(([id, v]) => ({ id, name: v.name, balance: v.owed }))
      .filter((d) => d.balance > 0.009)
      .sort((a, b) => b.balance - a.balance)
    const debtTotal = round2(debtors.reduce((a, d) => a + d.balance, 0))

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
