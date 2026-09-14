import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/health - verificação de estado (público, sem dados sensíveis)
export async function GET() {
  try {
    await db.settings.count();
    return NextResponse.json({ ok: true, app: "CIC", time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
