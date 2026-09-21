import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signToken, cookieOptions, SESSION_COOKIE } from "@/lib/session";
import { bloqueado, segundosRestantes, registarFalha, registarSucesso, ipDoPedido, MSG_BLOQUEIO } from "@/lib/ratelimit";
import { pinConfere, pinLookupHmac } from "@/lib/pin";

/*
 * POST /api/login - autenticação por PIN (define cookie de sessão assinado)
 * Com userId: valida o PIN DESSE utilizador (cartões do ecrã de login).
 * Sem userId: procura o PIN em TODAS as contas activas - inclui a do
 * proprietário (isSystem), que não aparece nos cartões nem na RH. É o
 * "Acesso por código" do dono no ecrã de entrada.
 * v2.3: 5 tentativas falhadas por IP → bloqueio de 15 minutos (anti força-bruta).
 * v2.5 (S5): o PIN é conferido contra o HASH guardado (scrypt) - a base de
 * dados não guarda mais o PIN em texto. A procura usa o pinLookup (HMAC),
 * e contas restauradas de backups antigos ainda entram pela via legada.
 */
export async function POST(req: NextRequest) {
  const ip = ipDoPedido(req);
  if (bloqueado("login", ip)) {
    const seg = segundosRestantes("login", ip);
    return NextResponse.json(
      { error: `${MSG_BLOQUEIO} (${Math.ceil(seg / 60)} min)` },
      { status: 429 }
    );
  }
  try {
    const { pin, userId } = await req.json()
    if (!pin) return NextResponse.json({ error: "PIN obrigatório" }, { status: 400 })
    const pinStr = String(pin)

    // Candidata a conta: pelo cartão escolhido, ou pela impressão digital do PIN
    const candidato = userId
      ? await db.user.findFirst({
          where: { id: String(userId), active: true },
          select: { id: true, name: true, role: true, commissionPct: true, baseSalary: true, phone: true, pinHash: true, pin: true },
        })
      : (await db.user.findFirst({
          where: { pinLookup: pinLookupHmac(pinStr), active: true },
          select: { id: true, name: true, role: true, commissionPct: true, baseSalary: true, phone: true, pinHash: true, pin: true },
        }) ??
          // Recurso para contas restauradas de backups antigos (sem hash)
          await db.user.findFirst({
            where: { pin: pinStr, active: true },
            select: { id: true, name: true, role: true, commissionPct: true, baseSalary: true, phone: true, pinHash: true, pin: true },
          }))

    // O PIN tem de conferir (hash scrypt, ou legado em contas antigas)
    if (!candidato || !pinConfere(pinStr, candidato)) {
      registarFalha("login", ip);
      return NextResponse.json({ error: "PIN inválido ou utilizador inativo" }, { status: 401 })
    }

    registarSucesso("login", ip);
    const token = await signToken(candidato.id)
    const { pinHash: _h, pin: _p, ...user } = candidato
    const res = NextResponse.json(user)
    res.cookies.set(SESSION_COOKIE, token, cookieOptions(process.env.NODE_ENV === "production"))
    return res
  } catch {
    return NextResponse.json({ error: "Erro no login" }, { status: 500 })
  }
}
