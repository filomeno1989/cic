// ============================================================
// Sessão por cookie assinado (HMAC-SHA256) - CIC
// Funciona no Edge Runtime (middleware) e no Node (rotas API),
// usando apenas Web Crypto - sem dependências externas.
//
// Token: base64url(userId).base64url(expiraEmMs).base64url(hmac)
// Cookie: cic_session (httpOnly, sameSite=lax, secure em prod)
// ============================================================

export const SESSION_COOKIE = "cic_session";
const SESSION_DAYS = 30;

function secret(): string {
  return process.env.AUTH_SECRET || "cic-dev-secret-trocar-em-producao";
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(payload: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return new Uint8Array(sig);
}

/** Cria o token de sessão para um utilizador (expira em SESSION_DAYS). */
export async function signToken(userId: string): Promise<string> {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const payload = `${b64urlEncode(new TextEncoder().encode(userId))}.${b64urlEncode(new TextEncoder().encode(String(exp)))}`;
  const sig = await hmac(payload);
  return `${payload}.${b64urlEncode(sig)}`;
}

/** Valida o token (assinatura + expiração) e devolve o userId, ou null. */
export async function verifyToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userIdB64, expB64, sigB64] = parts;
  try {
    const expected = await hmac(`${userIdB64}.${expB64}`);
    const given = b64urlDecode(sigB64);
    // comparação em tempo constante
    if (expected.length !== given.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ given[i];
    if (diff !== 0) return null;

    const exp = Number(new TextDecoder().decode(b64urlDecode(expB64)));
    if (!Number.isFinite(exp) || Date.now() > exp) return null;

    return new TextDecoder().decode(b64urlDecode(userIdB64));
  } catch {
    return null;
  }
}

/** Opções seguras do cookie, adaptadas ao ambiente. */
export function cookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    maxAge: SESSION_DAYS * 86400,
    path: "/",
  };
}
