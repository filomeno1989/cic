import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"

// GET /api/products - catálogo achatado por variante (p/ PDV e gestão)
// ?arquivados=1 → inclui produtos e variações ARQUIVADOS (gestão de catálogo)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const incluirArquivados = searchParams.get("arquivados") === "1"

    const products = await db.product.findMany({
      where: incluirArquivados ? {} : { active: true },
      include: { variants: { orderBy: [{ color: "asc" }, { size: "asc" }] } },
      orderBy: { name: "asc" },
    })
    const flat = products.flatMap((p) =>
      p.variants
        .filter((v) => (incluirArquivados ? true : v.active))
        .map((v) => ({
          id: v.id,
          productId: p.id,
          productName: p.name,
          productCode: p.code,
          category: p.category,
          brand: p.brand,
          imagem: p.imagem, // P2: foto do produto (catálogo + portal)
          productActive: p.active, // v2.4: gestão de arquivados na UI
          color: v.color,
          size: v.size,
          costPrice: v.costPrice,
          retailPrice: v.retailPrice,
          wholesalePrice: v.wholesalePrice,
          wholesaleMinQty: v.wholesaleMinQty,
          stock: v.stock,
          minStock: v.minStock,
          expiryDate: v.expiryDate,
          active: v.active,
        }))
    )
    return NextResponse.json(flat)
  } catch {
    return NextResponse.json({ error: "Erro ao carregar produtos" }, { status: 500 })
  }
}

// POST /api/products - criar produto com grade de variações (só gerente)
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode criar produtos")

    const body = await req.json()
    const { code, name, category, brand, variants } = body
    if (!code || !name) return NextResponse.json({ error: "Código e nome obrigatórios" }, { status: 400 })
    const exists = await db.product.findUnique({ where: { code } })
    if (exists) return NextResponse.json({ error: "Código de produto já existe" }, { status: 400 })

    const product = await db.product.create({
      data: {
        code: String(code).toUpperCase().trim(),
        name,
        category: category || "Geral",
        brand: brand || null,
        variants: {
          create: (variants ?? []).map((v: Record<string, unknown>) => ({
            color: v.color || null,
            size: v.size || null,
            costPrice: Number(v.costPrice) || 0,
            retailPrice: Number(v.retailPrice) || 0,
            wholesalePrice: v.wholesalePrice ? Number(v.wholesalePrice) : null,
            wholesaleMinQty: Number(v.wholesaleMinQty) || 3,
            stock: Number(v.stock) || 0,
            minStock: Number(v.minStock) || 3, // (antes: Number(...) ?? 3 → NaN se vazio)
            expiryDate: v.expiryDate ? new Date(v.expiryDate as string) : null,
          })),
        },
      },
      include: { variants: true },
    })
    return NextResponse.json(product)
  } catch (e) {
    // Código duplicado em corrida (o check manual acima pode falhar sob duplo-clique)
    if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002")
      return NextResponse.json({ error: "Código de produto já existe" }, { status: 400 })
    return NextResponse.json({ error: "Erro ao criar produto" }, { status: 500 })
  }
}
