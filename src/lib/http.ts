// ============================================================
// fetch com TIMEOUT - evita botões presos a girar para sempre
// em redes lentas (Vodacom/Movitel). Aborta após `ms` e devolve
// erro claro que as views mostram como toast.
// ============================================================
export async function fetchT(url: string, opts: RequestInit = {}, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
