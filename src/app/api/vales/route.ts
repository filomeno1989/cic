import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"

// GET /api/vales?userId= - lista vales
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get("userId")
    const vales = await db.vale.findMany({
      where: userId ? { userId, paidOut: false } : { paidOut: false },
      orderBy: { date: "desc" },
      include: { user: { select: { name: true, role: true } } },
    })
    return NextResponse.json(vales)
  } catch {
    return NextResponse.json({ error: "Erro ao carregar vales" }, { status: 500 })
  }
}

// POST /api/vales - registar adiantamento (só gerente - validado na SESSÃO)
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode registar vales")

    const body = await req.json()
    const { userId, amount, reason } = body
    const value = Number(amount)
    if (!userId || !value || value <= 0)
      return NextResponse.json({ error: "Funcionário e valor válidos obrigatórios" }, { status: 400 })
    const vale = await db.vale.create({
      data: { userId, amount: value, reason: reason || null },
      include: { user: { select: { name: true, role: true } } },
    })
    return NextResponse.json(vale)
  } catch {
    return NextResponse.json({ error: "Erro ao registar vale" }, { status: 500 })
  }
}
