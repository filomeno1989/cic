import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"

// GET /api/expenses?limit=100 - lista despesas
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 300)
    const expenses = await db.expense.findMany({
      orderBy: { date: "desc" }, take: limit,
      include: { user: { select: { name: true } } },
    })
    return NextResponse.json(expenses)
  } catch {
    return NextResponse.json({ error: "Erro ao carregar despesas" }, { status: 500 })
  }
}

// POST /api/expenses - registar saída de caixa (Credelec, FIPAG, chapa...)
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = await req.json()
    const { category, description, amount } = body
    const value = Number(amount)
    if (!category || !value || value <= 0)
      return NextResponse.json({ error: "Categoria e valor válidos obrigatórios" }, { status: 400 })
    const expense = await db.expense.create({
      data: { category, description: description || null, amount: value, userId: session.id },
      include: { user: { select: { name: true } } },
    })
    return NextResponse.json(expense)
  } catch {
    return NextResponse.json({ error: "Erro ao registar despesa" }, { status: 500 })
  }
}
