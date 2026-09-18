import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/*
 * GET /api/login-users - lista de utilizadores para os CARTÕES do ecrã de login.
 *
 * PÚBLICO (sem sessão) porque é usado no próprio ecrã de entrada.
 * Devolve o mínimo necessário: id, name, role - NUNCA PINs, salários ou contactos.
 * A conta do proprietário (isSystem) NUNCA aparece aqui - ela entra pelo
 * "Acesso por código" no ecrã de login (PIN validado em /api/login sem userId).
 */
export async function GET() {
  try {
    const users = await db.user.findMany({
      where: { active: true, isSystem: false },
      orderBy: [{ role: "desc" }, { name: "asc" }], // gerentes primeiro
      select: { id: true, name: true, role: true },
    });
    return NextResponse.json(users);
  } catch {
    return NextResponse.json([], { status: 200 }); // falha → login mostra só "Acesso por código"
  }
}
