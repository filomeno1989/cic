import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { startOfTodayMZ } from "@/lib/tz"

async function computeExpected(userId: string) {
  const lastClosing = await db.cashClosing.findFirst({
    where: { userId },
    orderBy: { closedAt: "desc" },
  })
  const since = lastClosing
    ? lastClosing.closedAt
    : startOfTodayMZ() // 00:00 de Maputo (não do fuso do servidor)

  const [sales, amortizations, expenses] = await Promise.all([
    db.sale.findMany({
      where: { userId, status: "CONCLUIDA", createdAt: { gt: since } },
      select: { payments: { select: { method: true, amount: true, change: true } } },
    }),
    db.creditPayment.findMany({
      where: { userId, date: { gt: since } },
      select: { method: true, amount: true },
    }),
    db.expense.findMany({
      where: { userId, date: { gt: since } },
      select: { amount: true },
    }),
  ])

  let cash = 0, pos = 0, mpesa = 0, total = 0
  for (const s of sales) {
    for (const p of s.payments) {
      total += p.amount
      if (p.method === "DINHEIRO") cash += p.amount - (p.change ?? 0)
      else if (p.method === "POS") pos += p.amount
      else if (["MPESA", "EMOLA", "MKESH"].includes(p.method)) mpesa += p.amount
    }
  }
  for (const a of amortizations) {
    if (a.method === "DINHEIRO") cash += a.amount
    else if (a.method === "POS") pos += a.amount
    else if (["MPESA", "EMOLA", "MKESH"].includes(a.method)) mpesa += a.amount
  }
  const expenseTotal = expenses.reduce((a, e) => a + e.amount, 0)
  cash -= expenseTotal // despesas pagas do caixa reduzem o esperado

  return { since, cash, pos, mpesa, total, salesCount: sales.length }
}

// GET /api/closings - histórico (gerente vê diferenças; caixa vê só os seus totais contados)
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    const closings = await db.cashClosing.findMany({
      where: session.role === "GERENTE" ? {} : { userId: session.id },
      orderBy: { closedAt: "desc" },
      take: 60,
      include: { user: { select: { name: true } } },
    })
    // Ao gerente mostra tudo (incl. diferenças); ao caixa, esconde esperado/diferença
    return NextResponse.json(
      closings.map((c) => ({
        id: c.id, closedAt: c.closedAt, userName: c.user.name,
        countedCash: c.countedCash, countedPos: c.countedPos, countedMpesa: c.countedMpesa,
        ...(session.role === "GERENTE" && {
          expectedCash: c.expectedCash, expectedPos: c.expectedPos, expectedMpesa: c.expectedMpesa,
          diffCash: c.diffCash, diffPos: c.diffPos, diffMpesa: c.diffMpesa,
          salesTotal: c.salesTotal, note: c.note,
        }),
      }))
    )
  } catch {
    return NextResponse.json({ error: "Erro ao carregar fechos" }, { status: 500 })
  }
}

// POST /api/closings - FECHO CEGO: o caixa conta a gaveta, o sistema NÃO revela diferença
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const { countedCash, countedPos, countedMpesa, note } = await req.json()

    const expected = await computeExpected(session.id)

    const closing = await db.cashClosing.create({
      data: {
        userId: session.id,
        countedCash: Number(countedCash) || 0,
        countedPos: Number(countedPos) || 0,
        countedMpesa: Number(countedMpesa) || 0,
        expectedCash: expected.cash,
        expectedPos: expected.pos,
        expectedMpesa: expected.mpesa,
        diffCash: (Number(countedCash) || 0) - expected.cash,
        diffPos: (Number(countedPos) || 0) - expected.pos,
        diffMpesa: (Number(countedMpesa) || 0) - expected.mpesa,
        salesTotal: expected.total,
        note: note || null,
      },
    })

    // Resposta CEGA - nunca devolve diferenças nem valores esperados
    return NextResponse.json({
      ok: true,
      id: closing.id,
      closedAt: closing.closedAt,
      message: "Fecho registado com sucesso. A gaveta pode ser entregue / iniciado novo turno.",
    })
  } catch {
    return NextResponse.json({ error: "Erro ao fechar caixa" }, { status: 500 })
  }
}
