import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { startOfTodayMZ } from "@/lib/tz"

// P2: esperado calculado AUTOMATICAMENTE por carteira a partir das
// vendas/amortizações do turno. O caixa continua cego - o resultado
// (falta/sobra) só é visível ao gerente na conciliação.
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

  let cash = 0, pos = 0, mpesa = 0, emola = 0, mkesh = 0, total = 0
  for (const s of sales) {
    for (const p of s.payments) {
      total += p.amount
      if (p.method === "DINHEIRO") cash += p.amount - (p.change ?? 0)
      else if (p.method === "POS") pos += p.amount
      else if (p.method === "MPESA") mpesa += p.amount
      else if (p.method === "EMOLA") emola += p.amount
      else if (p.method === "MKESH") mkesh += p.amount
    }
  }
  for (const a of amortizations) {
    if (a.method === "DINHEIRO") cash += a.amount
    else if (a.method === "POS") pos += a.amount
    else if (a.method === "MPESA") mpesa += a.amount
    else if (a.method === "EMOLA") emola += a.amount
    else if (a.method === "MKESH") mkesh += a.amount
  }
  const expenseTotal = expenses.reduce((a, e) => a + e.amount, 0)
  cash -= expenseTotal // despesas pagas do caixa reduzem o esperado

  return { since, cash, pos, mpesa, emola, mkesh, total, salesCount: sales.length }
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
        countedEmola: c.countedEmola, countedMkesh: c.countedMkesh,
        ...(session.role === "GERENTE" && {
          expectedCash: c.expectedCash, expectedPos: c.expectedPos, expectedMpesa: c.expectedMpesa,
          expectedEmola: c.expectedEmola, expectedMkesh: c.expectedMkesh,
          diffCash: c.diffCash, diffPos: c.diffPos, diffMpesa: c.diffMpesa,
          diffEmola: c.diffEmola, diffMkesh: c.diffMkesh,
          salesTotal: c.salesTotal, note: c.note,
        }),
      }))
    )
  } catch {
    return NextResponse.json({ error: "Erro ao carregar fechos" }, { status: 500 })
  }
}

// POST /api/closings - FECHO CEGO: o caixa conta a gaveta e cada carteira,
// o sistema NÃO revela diferença (só o gerente vê na conciliação).
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const { countedCash, countedPos, countedMpesa, countedEmola, countedMkesh, note } = await req.json()

    const expected = await computeExpected(session.id)

    const num = (v: unknown) => Number(v) || 0
    const closing = await db.cashClosing.create({
      data: {
        userId: session.id,
        countedCash: num(countedCash),
        countedPos: num(countedPos),
        countedMpesa: num(countedMpesa),
        countedEmola: num(countedEmola),
        countedMkesh: num(countedMkesh),
        expectedCash: expected.cash,
        expectedPos: expected.pos,
        expectedMpesa: expected.mpesa,
        expectedEmola: expected.emola,
        expectedMkesh: expected.mkesh,
        diffCash: num(countedCash) - expected.cash,
        diffPos: num(countedPos) - expected.pos,
        diffMpesa: num(countedMpesa) - expected.mpesa,
        diffEmola: num(countedEmola) - expected.emola,
        diffMkesh: num(countedMkesh) - expected.mkesh,
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
