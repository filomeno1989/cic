import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { hashPin, pinLookupHmac, pinConfere } from "@/lib/pin"

/*
 * POST /api/conta/pin - MUDAR A MINHA PRÓPRIA PIN (v3.0, pedido do dono)
 *
 * A conta do proprietário (isSystem) é intocável na RH de propósito
 * (nenhum gerente pode alterá-la nem arquivá-la) - MAS isso impedia o
 * próprio dono de trocar a PIN dele de dentro do sistema. Aqui cada
 * utilizador com sessão iniciada muda a PRÓPRIA PIN provando a actual:
 * { pinActual: "1234", novoPin: "9876" }
 *
 * - A PIN actual é verificada (scrypt ou legado de backups antigos).
 * - A nova tem de ter 4-6 dígitos e ser única (pinLookup).
 * - A sessão NÃO cai (o cookie continua válido - só a PIN muda).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()

    const body = await req.json().catch(() => null)
    const pinActual = String(body?.pinActual ?? "")
    const novoPin = String(body?.novoPin ?? "")

    if (!/^\d{4,6}$/.test(novoPin))
      return NextResponse.json({ error: "A nova PIN deve ter 4 a 6 dígitos" }, { status: 400 })

    const user = await db.user.findUnique({ where: { id: session.id } })
    if (!user || !user.active) return unauthorized()

    // Prova de identidade: a PIN ACTUAL tem de conferir (nunca basta a sessão)
    if (!pinActual || !pinConfere(pinActual, { pinHash: user.pinHash, pin: user.pin }))
      return NextResponse.json({ error: "A PIN actual não confere" }, { status: 400 })

    if (pinActual === novoPin)
      return NextResponse.json({ error: "A nova PIN tem de ser diferente da actual" }, { status: 400 })

    // PIN única - senão o login escolheria a pessoa errada
    const clash = await db.user.findFirst({ where: { pinLookup: pinLookupHmac(novoPin), id: { not: user.id } } })
    if (clash) return NextResponse.json({ error: `Esta PIN já é usada por ${clash.name}` }, { status: 400 })

    await db.user.update({
      where: { id: user.id },
      data: { pin: "", pinHash: hashPin(novoPin), pinLookup: pinLookupHmac(novoPin) },
    })

    return NextResponse.json({ ok: true, mensagem: "PIN alterada com sucesso" })
  } catch {
    return NextResponse.json({ error: "Erro ao alterar a PIN" }, { status: 500 })
  }
}
