import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/auth";

// GET /api/me - utilizador da sessão actual (restaura sessão no dispositivo)
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  return NextResponse.json(user);
}
