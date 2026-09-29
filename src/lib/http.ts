// ============================================================
// fetch com TIMEOUT + sessão expirada + MODO MANUTENÇÃO (v3.2)
// - Aborta após `ms` (redes lentas Vodacom/Movitel) e devolve
//   erro claro que as views mostram como toast.
// - v3.0 (U4): um 401 a meio da sessão limpa a sessão local e
//   manda para /gestao?expirada=1 (não engole mais o erro).
// - v3.2 (F4): um 503 {manutencao:true} (sistema fechado pelo dono)
//   dispara o evento global "cic-manutencao" - o app-shell mostra
//   o aviso de manutenção a cobrir tudo enquanto durar o fecho.
// ============================================================
import { tratar401 } from "@/lib/sessao401";

export async function fetchT(url: string, opts: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    tratar401(url, res.status); // se expirou, já está a redireccionar
    // v3.2 (F4): fechou o sistema a meio do uso? avisa o app inteiro.
    if (res.status === 503 && typeof window !== "undefined") {
      const data = await res.clone().json().catch(() => null);
      if (data?.manutencao) {
        try {
          window.dispatchEvent(new CustomEvent("cic-manutencao", { detail: String(data.error ?? "") }));
        } catch { /* */ }
      }
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}
