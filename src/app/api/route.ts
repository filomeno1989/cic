import { NextResponse } from "next/server";

// GET /api - estado da aplicação (antigo "Hello, world!")
export async function GET() {
  return NextResponse.json({ app: "CIC Fragrâncias & Glamour", status: "ok" });
}
