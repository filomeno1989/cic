import { MZ_OFFSET_MS, mzMidnight, mzEndOfDay } from "@/lib/tz"
import { round2 } from "@/lib/money"
import type { Prisma } from "@prisma/client"

// ============================================================
// v2.8 - REGRAS DE COMISSÃO (pedido da Cleyde)
//
// Dois modos, escolhidos por funcionário na RH:
//
//  1. "TODAS" (omissão, regra antiga): comissão % sobre o TOTAL de
//     cada venda. É como o sistema sempre funcionou.
//
//  2. "DIA" (regra da "porta de entrada"): os primeiros N artigos
//     vendidos pelo vendedor NO MESMO dia não ganham comissão
//     (ex.: N=2 → o 1º e o 2º artigo do dia não pagam); a partir do
//     artigo N+1 a comissão % passa a aplicar-se POR ARTIGO VENDIDO.
//     - Dias NÃO se somam: vender 1 artigo hoje e 1 amanhã = 0 comissão.
//     - A contagem é por UNIDADES (artigos), de qualquer produto.
//     - Se anular uma venda, o dia é RECALCULADO: os artigos que
//       "entravam" voltam a contar e as comissões ajustam-se sozinhas.
//
// A fonte da verdade é sempre a lista de vendas CONCLUÍDAS do dia
// (fuso de Maputo). Recalcular é idempotente - pode correr quantas
// vezes forem precisas sem duplicar nada.
// ============================================================

export type ComissaoTx = Prisma.TransactionClient

/** Limites do dia de Maputo que contém o instante indicado (00:00 - 23:59:59.999). */
function mzDayBoundsDo(instant: Date): { start: Date; end: Date } {
  const wall = new Date(instant.getTime() + MZ_OFFSET_MS)
  const y = wall.getUTCFullYear()
  const m = wall.getUTCMonth()
  const d = wall.getUTCDate()
  return { start: mzMidnight(y, m, d), end: mzEndOfDay(y, m, d) }
}

/**
 * Recalcula a comissão de TODAS as vendas CONCLUÍDAS do vendedor no dia de
 * Maputo do instante indicado. Só faz algo para vendedores em modo "DIA".
 *
 * Como funciona: percorre as vendas do dia por ordem de hora, vai somando
 * as unidades e cada venda só ganha comissão sobre os artigos que ficam
 * PARA LÁ da "porta de entrada" (commissionMinQty). O valor da comissão
 * é proporcional: pct sobre (valor dos artigos elegíveis / valor da venda).
 * Assim o desconto da venda também se reparte de forma justa.
 */
export async function recalcularComissoesDoDia(
  tx: ComissaoTx,
  vendedorId: string,
  instant: Date
): Promise<void> {
  const vendedor = await tx.user.findUnique({
    where: { id: vendedorId },
    select: { commissionMode: true, commissionPct: true, commissionMinQty: true },
  })
  // Modo "TODAS" (ou sem %) segue a regra antiga gravada no momento da venda - nada a fazer.
  if (!vendedor || vendedor.commissionMode !== "DIA" || vendedor.commissionPct <= 0) return
  const minQty = Math.max(0, Math.floor(vendedor.commissionMinQty || 0))
  const pct = vendedor.commissionPct

  const { start, end } = mzDayBoundsDo(instant)
  const vendas = await tx.sale.findMany({
    where: {
      userId: vendedorId,
      status: "CONCLUIDA",
      createdAt: { gte: start, lte: end },
    },
    select: { id: true, total: true, commission: true, items: { select: { qty: true } } },
    orderBy: { createdAt: "asc" },
  })

  let jaContadas = 0 // unidades do dia que já passaram pela porta de entrada
  for (const v of vendas) {
    const unidades = v.items.reduce((a, i) => a + i.qty, 0)
    // Artigos desta venda que ficam para lá da porta:
    // posições jaContadas+1 ... jaContadas+unidades; elegíveis são as > minQty.
    const elegiveis = unidades > 0
      ? Math.min(unidades, Math.max(0, jaContadas + unidades - minQty))
      : 0
    const nova = round2(
      (v.total * pct / 100) * (unidades > 0 ? elegiveis / unidades : 0)
    )
    jaContadas += unidades
    // Só escreve quando muda (evita toques inúteis na base de dados)
    if (Math.abs(nova - v.commission) > 0.004) {
      await tx.sale.update({ where: { id: v.id }, data: { commission: nova } })
    }
  }
}
