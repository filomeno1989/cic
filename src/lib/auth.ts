// ============================================================
// Helper de sessão p/ rotas API (Node runtime):
// devolve o utilizador autenticado a partir do cookie assinado.
// O papel (GERENTE/CAIXA) passa a vir SEMPRE do servidor -
// nunca de campos do cliente como requesterRole.
// ============================================================
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyToken, SESSION_COOKIE } from "@/lib/session";

export type SessionInfo = {
  id: string;
  name: string;
  role: "GERENTE" | "CAIXA";
  commissionPct: number;
  baseSalary: number;
  phone: string | null;
};

export async function getSessionUser(req: NextRequest): Promise<SessionInfo | null> {
  const userId = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, role: true, commissionPct: true,
        baseSalary: true, phone: true, active: true,
      },
    });
    if (!user || !user.active) return null;
    return {
      id: user.id,
      name: user.name,
      role: user.role === "GERENTE" ? "GERENTE" : "CAIXA",
      commissionPct: user.commissionPct,
      baseSalary: user.baseSalary,
      phone: user.phone,
    };
  } catch {
    return null;
  }
}

export function unauthorized() {
  return Response.json({ error: "Sessão expirada - inicie sessão novamente" }, { status: 401 });
}

export function forbidden(msg = "Apenas o gerente pode executar esta ação") {
  return Response.json({ error: msg }, { status: 403 });
}
