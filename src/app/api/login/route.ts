import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signToken, cookieOptions, SESSION_COOKIE } from "@/lib/session";

// POST /api/login - autenticação por PIN (define cookie de sessão assinado)
export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json()
    if (!pin) return NextResponse.json({ error: "PIN obrigatório" }, { status: 400 })
    const user = await db.user.findFirst({
      where: { pin: String(pin), active: true },
      select: {
        id: true, name: true, role: true, commissionPct: true,
        baseSalary: true, phone: true,
      },
    })
    if (!user) return NextResponse.json({ error: "PIN inválido ou utilizador inativo" }, { status: 401 })

    const token = await signToken(user.id)
    const res = NextResponse.json(user)
    res.cookies.set(SESSION_COOKIE, token, cookieOptions(process.env.NODE_ENV === "production"))
    return res
  } catch {
    return NextResponse.json({ error: "Erro no login" }, { status: 500 })
  }
}
