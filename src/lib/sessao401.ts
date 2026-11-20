// ============================================================
// v3.0 (U4 da varredura de melhorias): SESSÃO EXPIRADA A MEIO DO DIA
// ------------------------------------------------------------
// Antes: uma resposta 401 a meio da sessão era engolida - o ecrã
// ficava estranho (listas vazias, botões que falham em silêncio).
// Agora: qualquer 401 numa rota protegida limpa a sessão local e
// manda o utilizador para /gestao com o aviso "sessão expirou".
// As rotas públicas (login, manutenção, health...) ficam de fora -
// nelas o 401 é resposta normal (PIN errado, por exemplo).
// ============================================================

const ROTAS_PUBLICAS = [
  "/api/login",
  "/api/login-users",
  "/api/verify-pin",
  "/api/manutencao",
  "/api/manutencao-status",
  "/api/setup",
  "/api/health",
  "/api/me",
  "/api/loja",
  "/api/imagens",
];

export function resposta401DeSessao(url: string, status: number): boolean {
  if (status !== 401) return false;
  if (typeof window === "undefined") return false;
  const path = (url || "").split("?")[0];
  if (ROTAS_PUBLICAS.some((p) => path === p || path.startsWith(p + "/"))) return false;
  return true;
}

/** Devolve true se tratou o 401 (a página está a ser redireccionada). */
export function tratar401(url: string, status: number): boolean {
  if (!resposta401DeSessao(url, status)) return false;
  try {
    sessionStorage.removeItem("cic_session_user");
  } catch { /* storage bloqueado */ }
  window.location.replace("/gestao?expirada=1");
  return true;
}
