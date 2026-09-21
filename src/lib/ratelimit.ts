// ============================================================
// BLOQUEIO DE TENTATIVAS (v2.3) - protege PINs e a chave de
// manutenção contra força-bruta (ex.: cliente curioso que apaga
// o /loja do endereço e tenta adivinhar códigos).
//
// Como funciona: por IP, 5 falhas → bloqueio de 15 minutos com
// mensagem para contactar o IT · Manutenção. Sucesso limpa o
// contador. Guardado em memória do servidor (por instância) -
// primeira camada de defesa, simples e sem custo extra.
// ============================================================

const MAX_FALHAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000; // 15 minutos

type Rec = { falhas: number; bloqueadoAte: number };

// O Map vive em globalThis (padrão igual ao cliente Prisma): o Next pode
// re-avaliar módulos entre pedidos e o estado em memória do módulo perde-se.
// Em globalThis sobrevive enquanto a instância do servidor estiver quente.
const globalParaLimites = globalThis as unknown as {
  __cicLimites?: Map<string, Rec>;
};
const registos: Map<string, Rec> =
  globalParaLimites.__cicLimites ?? new Map<string, Rec>();
globalParaLimites.__cicLimites = registos;

export const MSG_BLOQUEIO =
  "Demasiadas tentativas. Aguarde 15 minutos e tente novamente, ou contacte o IT · Manutenção.";

// IP do pedido (Vercel fornece x-forwarded-for)
export function ipDoPedido(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim();
  return ip || req.headers.get("x-real-ip") || "desconhecido";
}

function chave(ambito: string, ip: string): string {
  return `${ambito}:${ip}`;
}

/** Está este IP bloqueado neste âmbito? */
export function bloqueado(ambito: string, ip: string): boolean {
  const r = registos.get(chave(ambito, ip));
  if (!r) return false;
  // Só apaga se HOUVE bloqueio e ele expirou. Um registo com
  // bloqueadoAte=0 (apenas falhas, ainda não bloqueado) NUNCA expira -
  // (o bug clássico: tratar "nunca bloqueado" como "bloqueio expirado"
  // apagava o contador a cada verificação e o limite nunca chegava a 5).
  if (r.bloqueadoAte > 0 && r.bloqueadoAte <= Date.now()) {
    registos.delete(chave(ambito, ip));
    return false;
  }
  return r.bloqueadoAte > Date.now();
}

/** Segundos que faltam para desbloquear (para mostrar na mensagem). */
export function segundosRestantes(ambito: string, ip: string): number {
  const r = registos.get(chave(ambito, ip));
  if (!r || r.bloqueadoAte <= Date.now()) return 0;
  return Math.max(1, Math.ceil((r.bloqueadoAte - Date.now()) / 1000));
}

/** Registar uma tentativa falhada. A 5ª consecutiva bloqueia 15 min. */
export function registarFalha(ambito: string, ip: string): void {
  const k = chave(ambito, ip);
  const r = registos.get(k) ?? { falhas: 0, bloqueadoAte: 0 };
  r.falhas += 1;
  if (r.falhas >= MAX_FALHAS) {
    r.bloqueadoAte = Date.now() + BLOQUEIO_MS;
    r.falhas = 0;
  }
  registos.set(k, r);
  // higiene: se o mapa crescer demasiado, limpa entradas expiradas
  if (registos.size > 10_000) {
    const agora = Date.now();
    for (const [ck, cr] of registos) {
      if (cr.bloqueadoAte <= agora) registos.delete(ck);
    }
  }
}

/** Tentativa bem sucedida - limpa o histórico do IP neste âmbito. */
export function registarSucesso(ambito: string, ip: string): void {
  registos.delete(chave(ambito, ip));
}
