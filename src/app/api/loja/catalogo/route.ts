import { NextResponse } from "next/server"
import { db } from "@/lib/db"

/*
 * GET /api/loja/catalogo - PÚBLICO (alimente o portal do cliente /loja).
 * Devolve apenas o que o cliente pode ver: nome, categoria, marca, cor/tamanho,
 * preço retalho, disponibilidade e foto. NUNCA custos, stock exacto,
 * preços grossistas nem dados internos.
 */
export async function GET() {
  try {
    const products = await db.product.findMany({
      where: { active: true },
      include: { variants: { where: { active: true }, orderBy: [{ color: "asc" }, { size: "asc" }] } },
      orderBy: { name: "asc" },
    })
    const flat = products.flatMap((p) =>
      p.variants
        .filter((v) => v.retailPrice > 0)
        .map((v) => ({
          id: v.id,
          productId: p.id,
          nome: p.name,
          codigo: p.code,
          categoria: p.category,
          marca: p.brand,
          cor: v.color,
          tamanho: v.size,
          preco: v.retailPrice,
          disponivel: v.stock > 0,
          imagem: p.imagem,
        }))
    )
    return NextResponse.json(flat)
  } catch {
    return NextResponse.json({ error: "Erro ao carregar catálogo" }, { status: 500 })
  }
}
