import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"
import { hashPin, pinLookupHmac } from "@/lib/pin"

// v3.3: validação da foto de perfil - só data URL de imagem, até ~300KB
// (as fotos já chegam comprimidas a 320px pelo aparelho; isto é rede de segurança)
function fotoValida(v: unknown): string | null | undefined {
  if (v === undefined) return undefined; // campo não veio - não mexer
  if (v === null || v === "") return null; // remover foto
  const s = String(v);
  if (!s.startsWith("data:image/")) throw new Error("Foto inválida - use JPG ou PNG")
  if (s.length > 300_000) throw new Error("Foto demasiado grande - escolha outra mais leve")
  return s;
}

// Campos seguros para a resposta - NUNCA devolver pin/pinHash/pinLookup
function seguro(u: { id: string; name: string; role: string; active: boolean; phone: string | null; photoUrl: string | null; baseSalary: number; commissionPct: number; commissionMode: string; commissionMinQty: number; createdAt: Date }) {
  return {
    id: u.id, name: u.name, role: u.role, active: u.active, phone: u.phone,
    photoUrl: u.photoUrl,
    baseSalary: u.baseSalary, commissionPct: u.commissionPct,
    commissionMode: u.commissionMode, commissionMinQty: u.commissionMinQty,
    createdAt: u.createdAt,
  }
}

// GET /api/users - lista funcionários (com estatísticas p/ RH) - SÓ GERENTE
// v2.4: antes qualquer caixa autenticado via API via salários/comissões (falha da auditoria).
// A conta do proprietário (isSystem) NUNCA aparece aqui - invisível na RH.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode ver a lista de funcionários")
    const users = await db.user.findMany({
      where: { isSystem: false },
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, role: true, active: true, phone: true, photoUrl: true,
        baseSalary: true, commissionPct: true,
        commissionMode: true, commissionMinQty: true, createdAt: true,
      },
    })
    return NextResponse.json(users)
  } catch {
    return NextResponse.json({ error: "Erro ao carregar funcionários" }, { status: 500 })
  }
}

// POST /api/users - criar funcionário (só gerente - validado na SESSÃO)
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode criar funcionários")

    const body = await req.json()
    const { name, pin, role, baseSalary, commissionPct, commissionMode, commissionMinQty, phone, photoUrl } = body
    let foto: string | null = null
    try {
      const f = fotoValida(photoUrl)
      if (f) foto = f
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Foto inválida" }, { status: 400 })
    }
    if (!name || !pin) return NextResponse.json({ error: "Nome e PIN obrigatórios" }, { status: 400 })
    if (String(pin).length < 4) return NextResponse.json({ error: "PIN deve ter 4+ dígitos" }, { status: 400 })
    if (!/^\d+$/.test(String(pin))) return NextResponse.json({ error: "PIN deve conter apenas números" }, { status: 400 })
    const exists = await db.user.findFirst({ where: { pinLookup: pinLookupHmac(String(pin)) } })
    if (exists) return NextResponse.json({ error: "Este PIN já está em uso" }, { status: 400 })
    // v2.5 (S5): o PIN é guardado como HASH scrypt + impressão digital HMAC.
    // O PIN em texto nunca toca a base de dados.
    const user = await db.user.create({
      data: {
        name, pin: "", pinHash: hashPin(String(pin)), pinLookup: pinLookupHmac(String(pin)),
        role: role === "GERENTE" ? "GERENTE" : "CAIXA",
        baseSalary: Number(baseSalary) || 0,
        commissionPct: Number(commissionPct) || 0,
        // v2.8 (regra DIA da Cleyde): modo da comissão + "porta de entrada"
        commissionMode: commissionMode === "DIA" ? "DIA" : "TODAS",
        commissionMinQty: Math.max(0, Math.min(999, Math.floor(Number(commissionMinQty) || 0))),
        phone: phone || null,
        photoUrl: foto, // v3.3: foto de perfil (avatar do login)
        isSystem: false, // contas criadas na RH nunca são de sistema
      },
    })
    return NextResponse.json(seguro(user))
  } catch {
    return NextResponse.json({ error: "Erro ao criar funcionário" }, { status: 500 })
  }
}
