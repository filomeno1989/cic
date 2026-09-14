import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ============================================================
// PORTA DE EMERGÊNCIA DO PROPRIETÁRIO - /api/manutencao
// ------------------------------------------------------------
// Permite ao dono da loja recuperar acesso em caso de perda de
// PIN, mesmo que nenhum gerente possa ajudar. Só funciona se a
// variável de ambiente RECOVERY_KEY estiver definida no servidor
// (Vercel → Settings → Environment Variables). A chave NUNCA é
// guardada na base de dados e NUNCA devolve PINs existentes.
//
// POST { chave, acao: "listar" }
//   → lista de contas (nome, papel, ativo) - sem PINs
// POST { chave, acao: "redefinir", alvo: "Nome da conta", novoPin: "1234" }
//   → redefine o PIN de uma conta existente (4-6 dígitos)
// POST { chave, acao: "criar_gerente", nome: "Filomeno", novoPin: "9999", phone? }
//   → cria uma nova conta de GERENTE ativa (acesso total)
// ============================================================

function chaveValida(recebida: string, correta: string): boolean {
  if (recebida.length !== correta.length) return false;
  let diff = 0;
  for (let i = 0; i < correta.length; i++) diff |= recebida.charCodeAt(i) ^ correta.charCodeAt(i);
  return diff === 0; // comparação em tempo constante (simples)
}

function pinOk(p: unknown): p is string {
  return typeof p === "string" && /^\d{4,6}$/.test(p);
}

export async function POST(req: NextRequest) {
  const KEY = process.env.RECOVERY_KEY;
  // Sem chave configurada (ou fraca demais) a porta nem existe
  if (!KEY || KEY.length < 24) {
    return NextResponse.json({ error: "Manutenção desativada" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const chave = String(body?.chave ?? "");
  if (!chaveValida(chave, KEY)) {
    return NextResponse.json({ error: "Chave de manutenção inválida" }, { status: 403 });
  }

  const acao = String(body?.acao ?? "");

  try {
    // ---- LISTAR: ver que contas existem (sem mostrar PINs) ----
    if (acao === "listar") {
      const users = await db.user.findMany({
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: { name: true, role: true, active: true, createdAt: true },
      });
      return NextResponse.json({ ok: true, contas: users });
    }

    // ---- REDEFINIR: trocar o PIN de uma conta existente ----
    if (acao === "redefinir") {
      const alvo = String(body?.alvo ?? "").trim();
      const novoPin = body?.novoPin;
      if (!alvo || !pinOk(novoPin)) {
        return NextResponse.json({ error: "Indique 'alvo' (nome da conta) e 'novoPin' (4-6 dígitos)" }, { status: 400 });
      }
      // Compatível com SQLite (local) e PostgreSQL (Vercel): comparação de nome em JS
      const all = await db.user.findMany({ select: { id: true, name: true, role: true, active: true } });
      const alvoLc = alvo.toLowerCase();
      const user = all.find((u) => u.id === alvo || u.name.toLowerCase() === alvoLc);
      if (!user) return NextResponse.json({ error: `Conta «${alvo}» não encontrada (use acao=listar)` }, { status: 404 });
      const clash = await db.user.findFirst({ where: { pin: novoPin, id: { not: user.id } } });
      if (clash) return NextResponse.json({ error: `Este PIN já é usado por ${clash.name}` }, { status: 400 });
      await db.user.update({ where: { id: user.id }, data: { pin: novoPin, active: true } });
      return NextResponse.json({ ok: true, mensagem: `PIN de «${user.name}» (${user.role}) redefinido. Pode entrar agora com o novo PIN.` });
    }

    // ---- CRIAR GERENTE: nova conta de acesso total ----
    if (acao === "criar_gerente") {
      const nome = String(body?.nome ?? "").trim();
      const novoPin = body?.novoPin;
      const phone = body?.phone ? String(body.phone) : null;
      if (!nome || !pinOk(novoPin)) {
        return NextResponse.json({ error: "Indique 'nome' e 'novoPin' (4-6 dígitos)" }, { status: 400 });
      }
      const clash = await db.user.findFirst({ where: { pin: novoPin } });
      if (clash) return NextResponse.json({ error: `Este PIN já é usado por ${clash.name}` }, { status: 400 });
      const user = await db.user.create({
        data: { name: nome, pin: novoPin, role: "GERENTE", active: true, phone },
      });
      return NextResponse.json({ ok: true, mensagem: `Conta de gerente «${user.name}» criada. Entre com o PIN e troque-o depois em Recursos Humanos.` });
    }

    return NextResponse.json({ error: "Ação desconhecida (use: listar | redefinir | criar_gerente)" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Erro de manutenção (base de dados indisponível?)" }, { status: 500 });
  }
}
