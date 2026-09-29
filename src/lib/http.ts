// ============================================================
// fetch com TIMEOUT + sessão expirada
// - Aborta após `ms` (redes lentas Vodacom/Movitel) e devolve
//   erro claro que as views mostram como toast.
// - v3.0 (U4): um 401 a meio da sessão limpa a sessão local e
//   manda para /gestao?expirada=1 (não engole mais o erro).
// ============================================================
import { tratar401 } from "@/lib/sessao401";

export async function fetchT(url: string, opts: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    tratar401(url, res.status); // se expirou, já está a redireccionar
    return res;
  } finally {
    clearTimeout(timer);
  }
}
