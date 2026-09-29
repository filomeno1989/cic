// ============================================================
// v3.2 (F4): MODO DE MANUTENÇÃO - motor no SERVIDOR (usa Prisma)
// ------------------------------------------------------------
// O proprietário fecha o sistema ao pessoal para trabalhos:
//   AGORA    → fechado já, até ele desligar ("aguarde, por favor")
//   AGENDADA → fechado só entre inicio e fim (aviso antes;
//              dentro do período bloqueia; depois abre sozinho
//              - não precisa de ninguém voltar a desligar)
// As funções puras (hora/estado/formatos) vivem em
// lib/hora-manutencao.ts para poderem ser usadas no browser também.
// ============================================================
import { db } from "@/lib/db";
import { calcularEstadoInterno, type ManutencaoRow } from "@/lib/hora-manutencao";

export { agoraMaputo, mostraHora, MSG_PADRAO_MANUTENCAO } from "@/lib/hora-manutencao";
export type { EstadoManutencao, ManutencaoRow } from "@/lib/hora-manutencao";

/** Lê a linha única (cria-a vazia se ainda não existir). Nunca rebenta. */
export async function lerManutencao(): Promise<ManutencaoRow> {
  try {
    let row = await db.manutencao.findUnique({ where: { id: "main" } });
    if (!row) row = await db.manutencao.create({ data: { id: "main" } });
    return { modo: row.modo, mensagem: row.mensagem, inicio: row.inicio, fim: row.fim };
  } catch {
    return { modo: "", mensagem: "", inicio: "", fim: "" }; // falha de BD → sistema operacional (não bloquear por erro)
  }
}

// Cache curta (20s) para não bater na BD em TODA a api com sessão
// (getSessionUser consulta o estado em cada pedido protegido).
let cache: { t: number; estado: ReturnType<typeof calcularEstadoInterno> } | null = null;

export function calcularEstado(row: ManutencaoRow) {
  return calcularEstadoInterno(row);
}

/** Estado calculado contra a hora de Maputo (directo, sem cache). */
export async function estadoManutencaoDireto() {
  return calcularEstadoInterno(await lerManutencao());
}

/** Estado com cache de 20s (uso em caminhos quentes como getSessionUser). */
export async function estadoManutencao() {
  if (cache && Date.now() - cache.t < 20_000) return cache.estado;
  const estado = calcularEstadoInterno(await lerManutencao());
  cache = { t: Date.now(), estado };
  return estado;
}

/** Invalida a cache (depois de PUT /API de manutenção). */
export function limparCacheManutencao(): void {
  cache = null;
}
