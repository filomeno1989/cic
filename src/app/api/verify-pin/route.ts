import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bloqueado, segundosRestantes, registarFalha, ipDoPedido, MSG_BLOQUEIO } from "@/lib/ratelimit";

/*
 * POST /api/verify-pin - valida PIN de GERENTE SEM alterar a sessão.
 * Usado pelo diálogo de autorização (descontos >10%, anulações):
 * o caixa continua com a SUA sessão - só confirma que um gerente
 * autorizou. Nada é revelado além de ok/nome.
 * v2.3: 5 tentativas falhadas por IP → bloqueio de 15 minutos.
 */
export async function POST(req: NextRequest) {
  const ip = ipDoPedido(req);
  if (bloqueado("verify-pin", ip)) {
    const seg = segundosRestantes("verify-pin", ip);
    return NextResponse.json(
      { ok: false, error: `${MSG_BLOQUEIO} (${Math.ceil(seg / 60)} min)` },
      { status: 429 }
    );
  }
  try {
    const { pin } = await req.json();
    if (!pin) return NextResponse.json({ ok: false, error: "PIN obrigatório" }, { status: 400 });
    const manager = await db.user.findFirst({
      where: { pin: String(pin), role: "GERENTE", active: true },
      select: { name: true },
    });
    if (!manager) {
      registarFalha("verify-pin", ip);
      return NextResponse.json({ ok: false, error: "PIN de gerente inválido" }, { status: 401 });
    }
    return NextResponse.json({ ok: true, name: manager.name });
  } catch {
    return NextResponse.json({ ok: false, error: "Erro na verificação" }, { status: 500 });
  }
}
