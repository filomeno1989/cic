import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { round2 } from "@/lib/money"

// GET /api/lucro?from=ISO&to=ISO - relatório de LUCRO (v2.7, pedido da Cleide).
// Devolve receita, custo das mercadorias, lucro bruto, despesas, lucro líquido,
// margem, comissões, ranking de produtos por lucro e valor do stock actual.
// APENAS GERENTE - o caixa nunca vê lucro (nem via API manipulada).
//
// O custo vem do SNAPSHOT gravado em cada item no momento da venda
// (SaleItem.costPrice, v2.7) - mudar o custo de um produto depois NÃO altera
// o lucro do passado. Para vendas antigas (antes da v2.7) usa-se o custo
// actual da variante como aproximação (o histórico foi retro-preenchido).
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE")
      return NextResponse.json({ error: "Apenas o gerente pode ver o lucro." }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    // v2.7: datas inválidas NUNCA chegam ao Prisma (Invalid Date → 500).
    // Formato esperado: ISO canónico (o cliente usa toISOString()).
    const fromDate = from ? new Date(from) : null
    const toDate = to ? new Date(to) : null
    if ((from && (!fromDate || isNaN(fromDate.getTime()))) || (to && (!toDate || isNaN(toDate.getTime()))))
      return NextResponse.json({ error: "Data inválida (usar ISO, ex.: 2026-09-01T00:00:00.000Z)" }, { status: 400 })

    const [vendas, despesas, stockAgreg, variantes, anuladas] = await Promise.all([
      db.sale.findMany({
        where: {
          status: "CONCLUIDA",
          ...(from || to
            ? {
                createdAt: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              }
            : {}),
        },
        select: {
          total: true, commission: true, isCredit: true,
          items: {
            select: {
              qty: true, total: true, name: true, variantLabel: true, costPrice: true,
              variant: { select: { costPrice: true } },
            },
          },
          payments: { select: { method: true, amount: true } },
        },
      }),
      db.expense.findMany({
        where: {
          ...(from || to
            ? {
                date: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              }
            : {}),
        },
        select: { amount: true },
      }),
      // Valor do stock actual (contexto: quanto a loja tem em mercadoria)
      db.productVariant.aggregate({ where: { active: true }, _sum: { stock: true } }),
      db.productVariant.findMany({
        where: { active: true, stock: { gt: 0 } },
        select: { stock: true, costPrice: true, retailPrice: true },
      }),
      db.sale.aggregate({
        where: {
          status: "ANULADA",
          ...(from || to
            ? {
                createdAt: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              }
            : {}),
        },
        _count: true,
        _sum: { total: true },
      }),
    ])

    // ---- Totais (v2.6 D2: tudo a 2 decimais) ----
    const receita = round2(vendas.reduce((a, s) => a + s.total, 0))
    const custo = round2(
      vendas.flatMap((s) => s.items).reduce(
        (a, i) => a + (i.costPrice > 0 ? i.costPrice : i.variant.costPrice) * i.qty,
        0
      )
    )
    const despesasTotal = round2(despesas.reduce((a, e) => a + e.amount, 0))
    const comissoes = round2(vendas.reduce((a, s) => a + s.commission, 0))
    const lucroBruto = round2(receita - custo)
    const lucroLiquido = round2(lucroBruto - despesasTotal)
    const margemPct = receita > 0 ? round2((lucroBruto / receita) * 100) : 0
    const margemLiquidaPct = receita > 0 ? round2((lucroLiquido / receita) * 100) : 0

    // ---- Ranking de produtos por lucro ----
    type Agg = { nome: string; variante: string; qty: number; receita: number; custo: number }
    const porProdutoMap = new Map<string, Agg>()
    for (const s of vendas) {
      for (const i of s.items) {
        const key = `${i.name}||${i.variantLabel ?? ""}`
        const cur = porProdutoMap.get(key) ?? { nome: i.name, variante: i.variantLabel ?? "", qty: 0, receita: 0, custo: 0 }
        cur.qty += i.qty
        cur.receita = round2(cur.receita + i.total)
        cur.custo = round2(cur.custo + (i.costPrice > 0 ? i.costPrice : i.variant.costPrice) * i.qty)
        porProdutoMap.set(key, cur)
      }
    }
    const porProduto = [...porProdutoMap.values()]
      .map((p) => ({
        ...p,
        lucro: round2(p.receita - p.custo),
        margemPct: p.receita > 0 ? round2(((p.receita - p.custo) / p.receita) * 100) : 0,
      }))
      .sort((a, b) => b.lucro - a.lucro)

    // ---- Recebimentos por forma de pagamento ----
    const porMetodoMap = new Map<string, number>()
    for (const s of vendas) for (const p of s.payments) {
      porMetodoMap.set(p.method, round2((porMetodoMap.get(p.method) ?? 0) + p.amount))
    }
    const porMetodo = [...porMetodoMap.entries()]
      .map(([metodo, total]) => ({ metodo, total }))
      .sort((a, b) => b.total - a.total)

    const creditado = round2(vendas.filter((s) => s.isCredit).reduce((a, s) => a + s.total, 0))
    const stockValorCusto = round2(variantes.reduce((a, v) => a + v.stock * v.costPrice, 0))
    const stockValorRetalho = round2(variantes.reduce((a, v) => a + v.stock * v.retailPrice, 0))

    return NextResponse.json({
      resumo: {
        receita,
        custo,
        lucroBruto,
        despesas: despesasTotal,
        lucroLiquido,
        margemPct,
        margemLiquidaPct,
        comissoes,
        vendasCount: vendas.length,
        ticketMedio: vendas.length ? round2(receita / vendas.length) : 0,
        anuladasCount: anuladas._count,
        anuladasValor: round2(Number(anuladas._sum.total ?? 0)),
        creditado, // vendas a fiação do período (receita ainda por receber)
      },
      porProduto,
      porMetodo,
      stock: {
        valorCusto: stockValorCusto,
        valorRetalho: stockValorRetalho,
        unidades: Number(stockAgreg._sum.stock ?? 0),
      },
    })
  } catch {
    return NextResponse.json({ error: "Erro ao calcular o lucro" }, { status: 500 })
  }
}
