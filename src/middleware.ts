// ============================================================
// Middleware de autenticação - protege TODAS as rotas /api/*
// excepto login, setup (primeiro acesso) e health.
// Sem sessão válida → 401. Roda no Edge (rápido, sem BD).
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "@/lib/session";

const PUBLIC_PATHS = ["/api/login", "/api/setup", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const userId = await verifyToken(token);

  if (!userId) {
    return NextResponse.json(
      { error: "Sessão expirada - inicie sessão novamente" },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
