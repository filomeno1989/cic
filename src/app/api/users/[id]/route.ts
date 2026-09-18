import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"

// PUT /api/users/[id] - atualizar funcionário (só gerente - validado na SESSÃO)
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode editar funcionários")

    const body = await req.json()
    const { name, pin, role, baseSalary, commissionPct, phone, active } = body
    if (pin && String(pin).length < 4)
      return NextResponse.json({ error: "PIN deve ter 4+ dígitos" }, { status: 400 })
    if (pin && !/^\d+$/.test(String(pin)))
      return NextResponse.json({ error: "PIN deve conter apenas números" }, { status: 400 })
    // PIN tem de ser ÚNICO - senão o login escolheria a pessoa errada
    if (pin) {
      const clash = await db.user.findFirst({ where: { pin: String(pin), id: { not: id } } })
      if (clash) return NextResponse.json({ error: `Este PIN já é usado por ${clash.name}` }, { status: 400 })
    }

    // ---- Proteções anti-bloqueio (o proprietário nunca pode ficar sem acesso) ----
    const target = await db.user.findUnique({ where: { id } })
    if (!target) return NextResponse.json({ error: "Funcionário não encontrado" }, { status: 404 })
    // 0) A conta do PROPRIETÁRIO (isSystem) é intocável por aqui - nem ver ela aparece.
    //    Só pode ser gerida pelo próprio dono ou pela porta /api/manutencao (RECOVERY_KEY).
    if (target.isSystem)
      return NextResponse.json({ error: "Esta é a conta do proprietário - não pode ser alterada aqui" }, { status: 403 })
    // 1) Ninguém pode arquivar a própria conta (perderia o acesso imediatamente)
    if (session.id === id && active === false)
      return NextResponse.json({ error: "Não pode arquivar a sua própria conta" }, { status: 400 })
    // 2) Não desativar nem rebaixar o ÚLTIMO gerente ativo - a loja ficaria sem gestão
    if (target.role === "GERENTE" && (active === false || role === "CAIXA")) {
      const outrosGerentes = await db.user.count({ where: { role: "GERENTE", active: true, id: { not: id } } })
      if (outrosGerentes === 0)
        return NextResponse.json({ error: "Não pode desativar ou rebaixar o último gerente ativo - crie/ative outro gerente primeiro" }, { status: 400 })
    }

    const user = await db.user.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(pin && { pin: String(pin) }),
        ...(role && { role: role === "GERENTE" ? "GERENTE" : "CAIXA" }),
        ...(baseSalary !== undefined && { baseSalary: Number(baseSalary) || 0 }),
        ...(commissionPct !== undefined && { commissionPct: Number(commissionPct) || 0 }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(active !== undefined && { active: !!active }),
      },
    })
    return NextResponse.json(user)
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar funcionário" }, { status: 500 })
  }
}

// DELETE /api/users/[id] - eliminar funcionário (só gerente; bloqueado se tiver registos)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode eliminar funcionários")
    if (session.id === id)
      return NextResponse.json({ error: "Não pode eliminar a sua própria conta" }, { status: 400 })

    const target = await db.user.findUnique({ where: { id } })
    if (!target) return NextResponse.json({ error: "Funcionário não encontrado" }, { status: 404 })
    // Conta do PROPRIETÁRIO (isSystem): nunca pode ser eliminada por aqui
    if (target.isSystem)
      return NextResponse.json({ error: "Esta é a conta do proprietário - não pode ser eliminada" }, { status: 403 })

    const [salesCount, valesCount, closingsCount, expensesCount] = await Promise.all([
      db.sale.count({ where: { userId: id } }),
      db.vale.count({ where: { userId: id } }),
      db.cashClosing.count({ where: { userId: id } }),
      db.expense.count({ where: { userId: id } }),
    ])
    if (salesCount > 0 || valesCount > 0 || closingsCount > 0 || expensesCount > 0)
      return NextResponse.json(
        { error: "Este funcionário tem vendas/vales/fechos no histórico e não pode ser eliminado. Use «Arquivar» para desativar o acesso mantendo o histórico." },
        { status: 409 }
      )

    // Nunca deixar a loja sem nenhum gerente ativo
    const gerentes = await db.user.count({ where: { role: "GERENTE", active: true } })
    if (target.role === "GERENTE" && gerentes <= 1)
      return NextResponse.json({ error: "Não pode eliminar o último gerente ativo" }, { status: 400 })

    await db.user.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao eliminar funcionário" }, { status: 500 })
  }
}
