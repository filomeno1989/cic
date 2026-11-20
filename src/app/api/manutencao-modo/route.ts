import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { lerManutencao, limparCacheManutencao, agoraMaputo } from "@/lib/manutencao";

// ============================================================
// v3.2 (F4): GET/PUT /api/manutencao-modo - controlo do cartão
// "Modo de Manutenção" nas Definições (só GERENTE, como o resto
// das Definições). O bloqueio em si é aplicado no login, nas
// sessões (lib/auth) e mostrado no ecrã de entrada (status público).
//
// PUT { modo: "" | "AGORA" | "AGENDADA", mensagem?, inicio?, fim? }
//   ""        → desligar (sistema operacional)
//   "AGORA"   → fechar já (fim opcional = previsão de retorno)
//   "AGENDADA"→ exige inicio e fim (inicio < fim); abre sozinho no fim
// ============================================================
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return unauthorized();
  if (session.role !== "GERENTE") return forbidden();
  return NextResponse.json(await lerManutencao());
}

const HORA_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export async function PUT(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session) return unauthorized();
  if (session.role !== "GERENTE") return forbidden();

  const body = await req.json().catch(() => null);
  const modo = String(body?.modo ?? "");
  if (!["", "AGORA", "AGENDADA"].includes(modo)) {
    return NextResponse.json({ error: "Modo inválido (use: vazio, AGORA ou AGENDADA)" }, { status: 400 });
  }

  const mensagem = String(body?.mensagem ?? "").slice(0, 300);
  const inicio = String(body?.inicio ?? "").slice(0, 16);
  const fim = String(body?.fim ?? "").slice(0, 16);

  if (mensagem && mensagem.trim().length < 4) {
    return NextResponse.json({ error: "A mensagem personalizada é curta demais" }, { status: 400 });
  }

  if (modo === "AGENDADA") {
    if (!HORA_RE.test(inicio) || !HORA_RE.test(fim)) {
      return NextResponse.json({ error: "Indique a data/hora de início e de fim da manutenção" }, { status: 400 });
    }
    if (inicio >= fim) {
      return NextResponse.json({ error: "O início deve ser ANTES do fim" }, { status: 400 });
    }
    if (fim <= agoraMaputo()) {
      return NextResponse.json({ error: "O fim já passou - escolha uma hora futura" }, { status: 400 });
    }
  }

  if (modo === "AGORA" && fim && !HORA_RE.test(fim)) {
    return NextResponse.json({ error: "Previsão de retorno inválida" }, { status: 400 });
  }

  try {
    await db.manutencao.upsert({
      where: { id: "main" },
      create: {
        id: "main",
        modo,
        mensagem: mensagem.trim(),
        inicio: modo === "AGENDADA" ? inicio : modo === "AGORA" ? agoraMaputo() : "",
        fim,
        atualizadoPor: session.name,
      },
      update: {
        modo,
        mensagem: mensagem.trim(),
        inicio: modo === "AGENDADA" ? inicio : modo === "AGORA" ? agoraMaputo() : "",
        fim,
        atualizadoPor: session.name,
      },
    });
    limparCacheManutencao(); // o bloqueio/aviso vale a partir de já
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro ao guardar o modo de manutenção" }, { status: 500 });
  }
}
