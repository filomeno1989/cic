import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"

/*
 * P2 - Foto do produto (guardada na própria base de dados Supabase).
 * POST /api/products/[id]/imagem  { data: base64, mime }  → grava + actualiza Product.imagem
 * DELETE /api/products/[id]/imagem                        → remove a foto
 *
 * 100% ADITIVO: não toca em nenhum campo existente dos produtos já registados.
 * O cliente já envia a imagem comprimida (JPEG ~100-300KB, ver src/lib/imagem.ts).
 */
const MAX_BASE64_LEN = 4_000_000 // ~3MB em bytes binários
const MIME_OK = ["image/jpeg", "image/png", "image/webp"]

function urlImagem(imageId: string) {
  // ?v= rebenta a cache do navegador quando a foto muda
  return `/api/imagens/${imageId}?v=${Date.now()}`
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente gere produtos")

    const { id } = await ctx.params
    const product = await db.product.findUnique({ where: { id }, select: { id: true } })
    if (!product) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })

    const { data, mime } = await req.json()
    if (typeof data !== "string" || data.length < 32) {
      return NextResponse.json({ error: "Imagem vazia ou inválida" }, { status: 400 })
    }
    if (data.length > MAX_BASE64_LEN) {
      return NextResponse.json({ error: "Imagem demasiado grande - tente outra foto" }, { status: 413 })
    }
    const mimeOk = typeof mime === "string" && MIME_OK.includes(mime) ? mime : "image/jpeg"

    const buffer = Buffer.from(data, "base64")
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Imagem inválida" }, { status: 400 })
    }

    // Upsert: reenviar a foto substitui a anterior (1 foto por produto)
    const row = await db.productImage.upsert({
      where: { productId: id },
      update: { dados: buffer, mime: mimeOk },
      create: { productId: id, dados: buffer, mime: mimeOk },
    })
    const imagem = urlImagem(row.id)
    await db.product.update({ where: { id }, data: { imagem } })

    return NextResponse.json({ ok: true, imagem })
  } catch {
    return NextResponse.json({ error: "Erro ao guardar a imagem" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente gere produtos")

    const { id } = await ctx.params
    await db.productImage.deleteMany({ where: { productId: id } })
    await db.product.update({ where: { id }, data: { imagem: null } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao remover a imagem" }, { status: 500 })
  }
}
