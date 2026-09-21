import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"

// GET /api/users - lista funcionários (com estatísticas p/ RH) - SÓ GERENTE
// v2.4: antes qualquer caixa autenticado via API via salários/comissões (falha da auditoria).
// A conta do proprietário (isSystem) NUNCA aparece aqui - invisível na RH.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode ver a lista de funcionários")
    const users = await db.user.findMany({
      where: { isSystem: false },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, role: true, active: true, phone: true,
        baseSalary: true, commissionPct: true, createdAt: true,
      },
    })
    return NextResponse.json(users)
  } catch {
    return NextResponse.json({ error: "Erro ao carregar funcionários" }, { status: 500 })
  }
}

// POST /api/users - criar funcionário (só gerente - validado na SESSÃO)
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode criar funcionários")

    const body = await req.json()
    const { name, pin, role, baseSalary, commissionPct, phone } = body
    if (!name || !pin) return NextResponse.json({ error: "Nome e PIN obrigatórios" }, { status: 400 })
    if (String(pin).length < 4) return NextResponse.json({ error: "PIN deve ter 4+ dígitos" }, { status: 400 })
    if (!/^\d+$/.test(String(pin))) return NextResponse.json({ error: "PIN deve conter apenas números" }, { status: 400 })
    const exists = await db.user.findFirst({ where: { pin: String(pin) } })
    if (exists) return NextResponse.json({ error: "Este PIN já está em uso" }, { status: 400 })
    const user = await db.user.create({
      data: {
        name, pin: String(pin),
        role: role === "GERENTE" ? "GERENTE" : "CAIXA",
        baseSalary: Number(baseSalary) || 0,
        commissionPct: Number(commissionPct) || 0,
        phone: phone || null,
        isSystem: false, // contas criadas na RH nunca são de sistema
      },
    })
    return NextResponse.json(user)
  } catch {
    return NextResponse.json({ error: "Erro ao criar funcionário" }, { status: 500 })
  }
}
