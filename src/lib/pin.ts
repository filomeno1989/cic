import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

// ============================================================
// HASH DE PINs (v2.5 - achado S5 da auditoria)
// ------------------------------------------------------------
// Antes: PINs guardados em TEXTO SIMPLES na base de dados.
// Agora:
//  - User.pinHash  → scrypt (sal aleatório por conta) - verificação lenta,
//    resiste a brute-force mesmo se alguém copiar a base de dados.
//  - User.pinLookup → HMAC-SHA256 com o AUTH_SECRET - determinístico, serve
//    para (1) impedir PINs duplicados e (2) encontrar a conta no
//    "Acesso por código" SEM guardar o PIN nem permitir busca reversa
//    (sem o AUTH_SECRET, o HMAC é irreversível).
//  - User.pin (coluna antiga) fica vazia nas contas migradas; só é usada
//    como recurso de emergência para contas restauradas de backups ANTIGOS
//    (que ainda trazem PIN em texto e sem hash).
// ============================================================

/** Gera o hash scrypt do PIN. Formato: s1$<salt-hex>$<hash-hex> */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pin), salt, 64);
  return `s1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Verifica o PIN contra o hash guardado (comparação em tempo constante). */
export function verifyPin(pin: string, pinHash: string): boolean {
  try {
    const partes = String(pinHash).split("$");
    if (partes.length !== 3 || partes[0] !== "s1") return false;
    const salt = Buffer.from(partes[1], "hex");
    const esperado = Buffer.from(partes[2], "hex");
    const calculado = scryptSync(String(pin), salt, esperado.length);
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

/** Impressão digital do PIN p/ unicidade e busca de conta (HMAC com segredo do servidor). */
export function pinLookupHmac(pin: string): string {
  const segredo = process.env.AUTH_SECRET || "cic-fallback-secret";
  return createHmac("sha256", segredo).update(`pin:${String(pin)}`).digest("hex");
}

/**
 * Verifica o PIN de um utilizador contra pinHash (novo) ou pin (legado de
 * backups antigos). Devolve true se o PIN estiver correto.
 */
export function pinConfere(
  pin: string,
  user: { pinHash?: string | null; pin?: string | null }
): boolean {
  if (user.pinHash) return verifyPin(pin, user.pinHash);
  // Recurso apenas para contas restauradas de backups antigos (sem hash)
  return !!user.pin && user.pin === String(pin);
}
