import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/*
 * GET  /api/setup   → { needed: true } se a base de dados ainda não tem utilizadores
 * POST /api/setup   → cria a PRIMEIRA conta de gerente (só funciona com 0 utilizadores)
 *
 * Necessário após migrar para uma base de dados nova (ex: Supabase no Vercel):
 * sem isto não existiria ninguém para fazer o primeiro login.
 */

async function userCount(): Promise<number> {
  return db.user.count();
}

export async function GET() {
  try {
    return NextResponse.json({ needed: (await userCount()) === 0 });
  } catch {
    return NextResponse.json({ needed: false });
  }
}

export async function POST(req: NextRequest) {
  try {
    if ((await userCount()) > 0)
      return NextResponse.json(
        { error: "A configuração inicial já foi feita - use o seu PIN." },
        { status: 409 }
      );

    const { name, pin, phone } = await req.json();
    if (!name || !String(name).trim())
      return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    if (!pin || String(pin).length < 4)
      return NextResponse.json({ error: "PIN deve ter 4+ dígitos" }, { status: 400 });

    const user = await db.user.create({
      data: {
        name: String(name).trim(),
        pin: String(pin),
        role: "GERENTE",
        active: true,
        phone: phone || null,
      },
      select: { id: true, name: true, role: true, commissionPct: true, baseSalary: true, phone: true },
    });
    return NextResponse.json(user);
  } catch {
    return NextResponse.json({ error: "Erro ao criar conta de gerente" }, { status: 500 });
  }
}
