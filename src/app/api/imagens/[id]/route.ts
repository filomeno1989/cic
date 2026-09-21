import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

/*
 * GET /api/imagens/[id] - serve a foto do produto (PÚBLICO, sem sessão,
 * porque aparece no portal do cliente /loja). Cache de 1 ano + ?v= na URL
 * para rebentar a cache quando a foto é substituída.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const row = await db.productImage.findUnique({
      where: { id },
      select: { dados: true, mime: true },
    })
    if (!row) return NextResponse.json({ error: "Imagem não encontrada" }, { status: 404 })

    const bytes = Buffer.from(row.dados)
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": row.mime || "image/jpeg",
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar imagem" }, { status: 500 })
  }
}
