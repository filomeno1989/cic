import { MZ_OFFSET_MS, mzMidnight, mzEndOfDay } from "@/lib/tz"
import { round2 } from "@/lib/money"
import type { Prisma } from "@prisma/client"

// ============================================================
// v2.9 - REGRAS DE COMISSÃO (pedido da Cleyde)
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
//     - v2.9: a comissão é calculada sobre o PREÇO DE CADA ARTIGO
//       elegível (não sobre a média da venda) - "ganhar comissão por
//       artigo vendido" passou a ser literal. O desconto da venda
//       reparte-se de forma justa entre os artigos.
//     - Dias NÃO se somam: vender 1 artigo hoje e 1 amanhã = 0 comissão.
//     - A contagem é por UNIDADES (artigos), de qualquer produto.
//     - Se anular uma venda, o dia é RECALCULADO: os artigos que
//       "entravam" voltam a contar e as comissões ajustam-se sozinhas.
//
// v2.9 (pedido da gerência): quando a regra de um vendedor muda na RH,
// TODO o histórico dele é recalculado com a regra nova - a folha passa
// a reflectir sempre a regra actual (antes mantinha comissões antigas
// gravadas com a regra anterior, o que assustou a gerência: apareciam
// comissões de dias antes da regra existir).
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

/** Chave do dia de Maputo (YYYY-MM-DD) de um instante - para agrupar vendas por dia. */
function diaKeyMZ(instant: Date): string {
  const wall = new Date(instant.getTime() + MZ_OFFSET_MS)
  return `${wall.getUTCFullYear()}-${String(wall.getUTCMonth() + 1).padStart(2, "0")}-${String(wall.getUTCDate()).padStart(2, "0")}`
}

type VendaComItens = {
  id: string
  total: number
  subtotal: number
  commission: number
  createdAt: Date
  items: { qty: number; unitPrice: number }[]
}

/**
 * v2.9: comissão de UMA venda, artigo a artigo.
 * Percorre os artigos por ordem; cada unidade que fica para LÁ da
 * "porta de entrada" (minQty) ganha unitPrice × %. O desconto da venda
 * (subtotal − total) reparte-se proporcionalmente pelos artigos.
 * Devolve também as unidades da venda (para avançar a contagem do dia).
 */
function comissaoDaVenda(
  v: VendaComItens,
  jaContadasAntes: number,
  minQty: number,
  pct: number
): { valor: number; unidades: number } {
  const unidades = v.items.reduce((a, i) => a + i.qty, 0)
  let bruta = 0
  let contadas = jaContadasAntes
  for (const item of v.items) {
    // Artigos deste item que ficam para lá da porta:
    const elegiveis = Math.min(item.qty, Math.max(0, contadas + item.qty - minQty))
    bruta += elegiveis * item.unitPrice * (pct / 100)
    contadas += item.qty
  }
  // Desconto da venda repartido de forma justa (total = subtotal − desconto)
  const fator = v.subtotal > 0 ? v.total / v.subtotal : 1
  return { valor: round2(bruta * fator), unidades }
}

const SELECT_VENDA = {
  id: true,
  total: true,
  subtotal: true,
  commission: true,
  createdAt: true,
  items: { select: { qty: true, unitPrice: true } },
} as const

/**
 * Recalcula a comissão de TODAS as vendas CONCLUÍDAS do vendedor no dia de
 * Maputo do instante indicado. Só faz algo para vendedores em modo "DIA".
 * (Caminho rápido usado quando entra/anula uma venda.)
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
  const vendas: VendaComItens[] = await tx.sale.findMany({
    where: {
      userId: vendedorId,
      status: "CONCLUIDA",
      createdAt: { gte: start, lte: end },
    },
    select: SELECT_VENDA,
    orderBy: { createdAt: "asc" },
  })

  let jaContadas = 0 // unidades do dia que já passaram pela porta de entrada
  for (const v of vendas) {
    const { valor: nova, unidades } = comissaoDaVenda(v, jaContadas, minQty, pct)
    jaContadas += unidades
    // Só escreve quando muda (evita toques inúteis na base de dados)
    if (Math.abs(nova - v.commission) > 0.004) {
      await tx.sale.update({ where: { id: v.id }, data: { commission: nova } })
    }
  }
}

/**
 * v2.9: recalcula a comissão de TODO o histórico CONCLUÍDO do vendedor com a
 * regra ACTUAL (modo, % e porta de entrada). Corre quando a gerência muda a
 * regra na RH - assim a folha reflecte sempre a regra vigente, nunca mistura eras.
 *
 * - DIA: processa dia a dia (porta de entrada reinicia a cada dia de Maputo).
 * - TODAS: comissão = total × % em cada venda (o que a venda teria com a % actual).
 * Devolve o número de vendas alteradas (0 se a regra já estava reflectida).
 */
export async function recalcularComissoesTotais(
  tx: ComissaoTx,
  vendedorId: string
): Promise<number> {
  const vendedor = await tx.user.findUnique({
    where: { id: vendedorId },
    select: { commissionMode: true, commissionPct: true, commissionMinQty: true },
  })
  if (!vendedor) return 0
  const pct = vendedor.commissionPct
  const minQty = Math.max(0, Math.floor(vendedor.commissionMinQty || 0))

  const vendas: VendaComItens[] = await tx.sale.findMany({
    where: { userId: vendedorId, status: "CONCLUIDA" },
    select: SELECT_VENDA,
    orderBy: { createdAt: "asc" },
  })

  let mudadas = 0
  if (vendedor.commissionMode === "DIA") {
    let diaAtual = ""
    let jaContadas = 0
    for (const v of vendas) {
      const dia = diaKeyMZ(v.createdAt)
      if (dia !== diaAtual) {
        diaAtual = dia
        jaContadas = 0 // a porta de entrada reinicia a cada dia
      }
      const { valor: nova, unidades } = comissaoDaVenda(v, jaContadas, minQty, pct)
      jaContadas += unidades
      if (Math.abs(nova - v.commission) > 0.004) {
        await tx.sale.update({ where: { id: v.id }, data: { commission: nova } })
        mudadas++
      }
    }
  } else {
    for (const v of vendas) {
      const nova = round2((v.total * pct) / 100)
      if (Math.abs(nova - v.commission) > 0.004) {
        await tx.sale.update({ where: { id: v.id }, data: { commission: nova } })
        mudadas++
      }
    }
  }
  return mudadas
}
