// ============================================================
// v3.2 (F4): funções PURAS de hora/estado do modo de manutenção -
// sem Prisma, podem ser usadas no servidor E no browser.
// Horários guardados como texto local de Maputo "YYYY-MM-DDTHH:mm"
// (UTC+2, Moçambique não tem hora de verão) - a comparação de
// strings ISO local é segura e não depende do fuso do aparelho.
// ============================================================

export type EstadoManutencao = {
  ativo: boolean; // fechado neste momento (bloqueia pessoal)
  agendado: boolean; // há manutenção marcada para o futuro (aviso, não bloqueia)
  modo: "" | "AGORA" | "AGENDADA";
  mensagem: string;
  inicio: string;
  fim: string;
};

export const MSG_PADRAO_MANUTENCAO =
  "O sistema está em manutenção. Aguarde, por favor - voltamos brevemente.";

/** Agora em Maputo, no mesmo formato guardado ("YYYY-MM-DDTHH:mm"). */
export function agoraMaputo(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 16); // UTC+2 fixo
}

/** Formata "YYYY-MM-DDTHH:mm" para "DD/MM/AAAA às HH:mm" (para mostrar). */
export function mostraHora(valor: string): string {
  if (!valor || valor.length < 16) return valor || "";
  const [data, hora] = valor.split("T");
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a} às ${hora}`;
}

/** Linha crua guardada na base de dados (tabela Manutencao, id "main"). */
export type ManutencaoRow = {
  modo: string;
  mensagem: string;
  inicio: string;
  fim: string;
};

/** Estado calculado contra a hora de Maputo (função pura - sem BD). */
export function calcularEstadoInterno(row: ManutencaoRow): EstadoManutencao {
  const agora = agoraMaputo();
  const msg = row.mensagem.trim() || MSG_PADRAO_MANUTENCAO;
  if (row.modo === "AGORA") {
    return { ativo: true, agendado: false, modo: "AGORA", mensagem: msg, inicio: row.inicio, fim: row.fim };
  }
  if (row.modo === "AGENDADA" && row.inicio && row.fim) {
    if (agora >= row.inicio && agora <= row.fim) {
      return { ativo: true, agendado: false, modo: "AGENDADA", mensagem: msg, inicio: row.inicio, fim: row.fim };
    }
    if (agora < row.inicio) {
      return { ativo: false, agendado: true, modo: "AGENDADA", mensagem: msg, inicio: row.inicio, fim: row.fim };
    }
  }
  return { ativo: false, agendado: false, modo: "", mensagem: "", inicio: "", fim: "" };
}
