// ============================================================
// Dinheiro (D2 da auditoria) - arredondamento a 2 decimais.
// Os valores monetários vivem em Float (vírgula flutuante binária)
// na base de dados - somas como 0.1 + 0.2 acumulam erros invisíveis
// (0.30000000000000004) que aparecem como diferenças de 0,01 MT no
// painel, no fecho do caixa e na folha. TODA a soma de dinheiro no
// servidor passa por aqui antes de gravar ou devolver ao cliente.
//
// (A migração completa para Decimal(12,2) do Prisma fica para uma
// v3 - tocaria em todas as contas do frontend e é mudança de alto
// risco; o arredondamento em 2 decimais elimina o sintoma real.)
// ============================================================

/** Arredonda a 2 decimais (centavos) de forma estável. */
export function round2(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round((v + Number.EPSILON) * 100) / 100
}
