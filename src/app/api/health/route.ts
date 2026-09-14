import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/health - verificação de estado (público, sem dados sensíveis)
// Em caso de falha devolve apenas uma CATEGORIA de erro (sem segredos nem hostnames)
export async function GET() {
  try {
    await db.settings.count();
    return NextResponse.json({ ok: true, app: "CIC", time: new Date().toISOString() });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const msg = String(err?.message || "");
    let hint = "DB_ERROR";
    if (/Environment variable/i.test(msg)) hint = "ENV_MISSING";
    else if (err?.code === "P2021") hint = "TABLES_MISSING";
    else if (err?.code === "P1001") hint = "CANNOT_REACH_DB";
    else if (err?.code === "P1000" || err?.code === "P1017") hint = "AUTH_FAILED";
    return NextResponse.json({ ok: false, hint }, { status: 500 });
  }
}
