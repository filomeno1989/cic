// ============================================================
// Helper de sessão p/ rotas API (Node runtime):
// devolve o utilizador autenticado a partir do cookie assinado.
// O papel (GERENTE/CAIXA) passa a vir SEMPRE do servidor -
// nunca de campos do cliente como requesterRole.
// ============================================================
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyToken, SESSION_COOKIE } from "@/lib/session";
import { estadoManutencao } from "@/lib/manutencao";

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
        baseSalary: true, phone: true, active: true, isSystem: true,
      },
    });
    if (!user || !user.active) return null;

    // v3.2 (F4): MANUTENÇÃO ACTIVA - o pessoal fica bloqueado também a meio
    // do uso: as chamadas API passam a devolver 401 ("sessão terminou"), o
    // sistema manda para o ecrã de entrada e lá aparece o aviso de manutenção.
    // O proprietário (isSystem) continua a trabalhar para poder desligar o
    // modo; a manutenção AGENDADA reabre sozinha no fim (cache de 20s aqui).
    if (!user.isSystem) {
      const manut = await estadoManutencao();
      if (manut.ativo) return null;
    }

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
