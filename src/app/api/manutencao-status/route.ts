import { NextResponse } from "next/server";
import { estadoManutencao } from "@/lib/manutencao";

// ============================================================
// v3.2 (F4): GET /api/manutencao-status - PÚBLICO (usado no ecrã
// de login, antes de existir sessão). Devolve o estado CALCULADO
// contra a hora de Maputo - nunca expõe a chave de recuperação
// nem nada sensível:
//   ativo    → sistema fechado neste momento (mostra ecrã de manutenção)
//   agendado → há manutenção marcada para o futuro (mostra aviso)
// ============================================================
export async function GET() {
  const e = await estadoManutencao();
  return NextResponse.json({
    ativo: e.ativo,
    agendado: e.agendado,
    modo: e.modo,
    mensagem: e.mensagem,
    inicio: e.inicio,
    fim: e.fim,
  });
}
