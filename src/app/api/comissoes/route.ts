import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"
import { round2 } from "@/lib/money"
import { MZ_OFFSET_MS } from "@/lib/tz"

/*
 * GET /api/comissoes?from=&to= - RELATÓRIO DE COMISSÕES (v3.0, M1 da varredura)
 *
 * Por dia (fuso de Maputo) e por vendedor: nº de vendas, artigos vendidos
 * e comissão do dia. Foi a confusão da comissão "400 e qualquer coisa"
 * (setembro 2026) que mostrou a falta disto: sem este relatório não se
 * conseguia ver o que a regra estava a pagar em cada dia. Só gerente.
 *
 * Resposta:
 * {
 *   dias: [{ dia: "2026-09-28", vendedores: [{ userId, nome, vendas, artigos, comissao }], totalDia }],
 *   vendedores: [{ userId, nome, vendas, artigos, comissao }], // totais do período
 *   total: number
 * }
 */

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode ver o relatório de comissões")

    const url = new URL(req.url)
    const fromStr = url.searchParams.get("from")
    const toStr = url.searchParams.get("to")
    let from: Date | null = null
    let to: Date | null = null
    try {
      if (fromStr) { const d = new Date(fromStr); if (!Number.isNaN(d.getTime())) from = d; }
      if (toStr) { const d = new Date(toStr); if (!Number.isNaN(d.getTime())) to = d; }
    } catch { from = null; to = null; }
    if (from && to && from > to) { const t = from; from = to; to = t; }

    const onde = {
      status: "CONCLUIDA" as const,
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    }

    const [vendas, itens, users] = await Promise.all([
      db.sale.findMany({
        where: onde,
        select: { id: true, userId: true, total: true, commission: true, createdAt: true },
      }),
      db.saleItem.findMany({
        where: { sale: onde },
        select: { saleId: true, qty: true },
      }),
      db.user.findMany({ select: { id: true, name: true } }),
    ])

    const nomeDe = new Map(users.map((u) => [u.id, u.name]))
    const artigosPorVenda = new Map<string, number>()
    for (const it of itens) artigosPorVenda.set(it.saleId, (artigosPorVenda.get(it.saleId) ?? 0) + it.qty)

    // dia de Maputo = data de parede (desloca o instante +offset e corta em UTC)
    const diaDe = (d: Date) => new Date(d.getTime() + MZ_OFFSET_MS).toISOString().slice(0, 10)

    type Linha = { userId: string; nome: string; vendas: number; artigos: number; comissao: number }
    const porDia = new Map<string, Map<string, Linha>>()
    const porVendedor = new Map<string, Linha>()
    let total = 0

    for (const v of vendas) {
      const comissao = round2(v.commission ?? 0)
      const dia = diaDe(v.createdAt)
      if (!porDia.has(dia)) porDia.set(dia, new Map())
      const linhas = porDia.get(dia)!
      const l = linhas.get(v.userId) ?? { userId: v.userId, nome: nomeDe.get(v.userId) ?? "?", vendas: 0, artigos: 0, comissao: 0 }
      l.vendas += 1
      l.artigos += artigosPorVenda.get(v.id) ?? 0
      l.comissao = round2(l.comissao + comissao)
      linhas.set(v.userId, l)

      const tv = porVendedor.get(v.userId) ?? { userId: v.userId, nome: nomeDe.get(v.userId) ?? "?", vendas: 0, artigos: 0, comissao: 0 }
      tv.vendas += 1
      tv.artigos += artigosPorVenda.get(v.id) ?? 0
      tv.comissao = round2(tv.comissao + comissao)
      porVendedor.set(v.userId, tv)

      total = round2(total + comissao)
    }

    const dias = [...porDia.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([dia, mapa]) => {
        const vendedores = [...mapa.values()].sort((a, b) => b.comissao - a.comissao)
        return { dia, vendedores, totalDia: round2(vendedores.reduce((a, l) => a + l.comissao, 0)) }
      })

    const vendedores = [...porVendedor.values()].sort((a, b) => b.comissao - a.comissao)

    return NextResponse.json({ dias, vendedores, total })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar comissões" }, { status: 500 })
  }
}
