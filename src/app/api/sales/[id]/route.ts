import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"
import { bloqueado, registarFalha, registarSucesso, ipDoPedido, MSG_BLOQUEIO } from "@/lib/ratelimit"
import { pinConfere } from "@/lib/pin"

// DELETE /api/sales/[id] - anulação (estorno) exige SESSÃO de gerente + PIN de gerente
// v2.4: antes bastava o PIN (sem limite de tentativas e sem verificar o papel na sessão).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode anular vendas")

    const ip = ipDoPedido(req)
    if (bloqueado("anulacao", ip))
      return NextResponse.json({ error: MSG_BLOQUEIO }, { status: 429 })

    const { id } = await ctx.params
    const body = await req.json()
    const { managerPin, reason } = body
    if (!managerPin) return NextResponse.json({ error: "PIN do gerente obrigatório" }, { status: 403 })

    // v2.5 (S5): PIN conferido contra o hash (scrypt) - a base de dados já não
    // guarda o PIN em texto, por isso a procura é em memória conta a conta.
    const gerentes = await db.user.findMany({
      where: { role: "GERENTE", active: true },
      select: { pinHash: true, pin: true },
    })
    const manager = gerentes.find((g) => pinConfere(String(managerPin), g))
    if (!manager) {
      registarFalha("anulacao", ip)
      return NextResponse.json({ error: "PIN de gerente inválido" }, { status: 403 })
    }
    registarSucesso("anulacao", ip)

    const sale = await db.sale.findUnique({ where: { id }, include: { items: true } })
    if (!sale) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 })
    if (sale.status === "ANULADA") return NextResponse.json({ error: "Venda já anulada" }, { status: 400 })

    await db.$transaction([
      db.sale.update({ where: { id }, data: { status: "ANULADA", commission: 0 } }),
      // Devolve stock
      ...sale.items.map((i) =>
        db.productVariant.update({ where: { id: i.variantId }, data: { stock: { increment: i.qty } } })
      ),
    ])

    return NextResponse.json({ ok: true, reason: reason || null })
  } catch {
    return NextResponse.json({ error: "Erro ao anular venda" }, { status: 500 })
  }
}
