import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/health - verificação de estado (público, sem dados sensíveis)
// Em caso de falha devolve apenas uma CATEGORIA de erro (sem segredos nem hostnames)
// ?debug=<RECOVERY_KEY> inclui a mensagem real (com password removida) - só para o proprietário
export async function GET(req: NextRequest) {
  try {
    await db.settings.count();
    return NextResponse.json({ ok: true, app: "CIC", time: new Date().toISOString() });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const msg = String(err?.message || "");
    let hint = "DB_ERROR";
    if (/environment variable/i.test(msg)) hint = "ENV_MISSING";
    else if (err?.code === "P2021") hint = "TABLES_MISSING";
    else if (err?.code === "P1001") hint = "CANNOT_REACH_DB";
    else if (err?.code === "P1000") hint = "AUTH_FAILED";
    else if (err?.code === "P1017") hint = "CONNECTION_CLOSED";
    else if (err?.code === "P2024") hint = "POOL_TIMEOUT";
    else if (err?.code === "P2010") hint = "RAW_QUERY_FAILED";
    else if (err?.code === "P1002") hint = "TLS_TIMEOUT";
    else if (/invalid|malformed|parse|protocol/i.test(msg)) hint = "URL_INVALID";
    else if (/prepared statement/i.test(msg)) hint = "PGBOUNCER_FLAG";
    else if (/timeout|timed out/i.test(msg)) hint = "TIMEOUT";
    const body: Record<string, unknown> = { ok: false, hint, code: err?.code ?? null };
    const dbg = new URL(req.url).searchParams.get("debug");
    if (dbg && process.env.RECOVERY_KEY && dbg === process.env.RECOVERY_KEY) {
      body.debug = String(msg).replace(/:\/\/[^@/]*@/g, "://***@").slice(0, 600);
    }
    return NextResponse.json(body, { status: 500 });
  }
}
