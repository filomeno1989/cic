import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"

// PUT /api/products/[id] - atualizar produto e/ou variações (só gerente)
// v2.4: { active: false } ARQUIVA o produto (some do PDV/portal, histórico fica intacto);
//       { active: true } RESTAURA um produto arquivado.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode editar produtos")

    const { id } = await ctx.params
    const body = await req.json()
    const { name, category, brand, active, variants } = body

    const product = await db.product.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(category && { category }),
        ...(brand !== undefined && { brand: brand || null }),
        ...(active !== undefined && { active: !!active }),
      },
    })

    // Atualização de variações existentes (por id, garantindo que pertencem a este produto) ou criação de novas
    if (Array.isArray(variants)) {
      for (const v of variants) {
        if (v.id) {
          const owned = await db.productVariant.findFirst({ where: { id: v.id, productId: id } })
          if (!owned) continue // variação de outro produto - ignorar
          await db.productVariant.update({
            where: { id: v.id },
            data: {
              ...(v.color !== undefined && { color: v.color || null }),
              ...(v.size !== undefined && { size: v.size || null }),
              ...(v.costPrice !== undefined && { costPrice: Number(v.costPrice) || 0 }),
              ...(v.retailPrice !== undefined && { retailPrice: Number(v.retailPrice) || 0 }),
              ...(v.wholesalePrice !== undefined && { wholesalePrice: v.wholesalePrice ? Number(v.wholesalePrice) : null }),
              ...(v.wholesaleMinQty !== undefined && { wholesaleMinQty: Number(v.wholesaleMinQty) || 3 }),
              ...(v.minStock !== undefined && { minStock: Number(v.minStock) }),
              ...(v.expiryDate !== undefined && { expiryDate: v.expiryDate ? new Date(v.expiryDate) : null }),
              ...(v.active !== undefined && { active: !!v.active }),
            },
          })
        } else {
          await db.productVariant.create({
            data: {
              productId: id,
              color: v.color || null,
              size: v.size || null,
              costPrice: Number(v.costPrice) || 0,
              retailPrice: Number(v.retailPrice) || 0,
              wholesalePrice: v.wholesalePrice ? Number(v.wholesalePrice) : null,
              wholesaleMinQty: Number(v.wholesaleMinQty) || 3,
              stock: Number(v.stock) || 0,
              minStock: Number(v.minStock) || 3,
              expiryDate: v.expiryDate ? new Date(v.expiryDate) : null,
            },
          })
        }
      }
    }

    const updated = await db.product.findUnique({ where: { id }, include: { variants: true } })
    return NextResponse.json(updated ?? product)
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar produto" }, { status: 500 })
  }
}

// DELETE /api/products/[id] (só gerente)
// ?modo=definitivo → ELIMINA o produto de vez, MAS só se nunca teve vendas/movimentos
//                   (senão 409 — nesse caso use «Arquivar»).
// sem modo         → ARQUIVA (active=false), igual a PUT { active:false }. Mantido p/ compatibilidade.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden("Apenas o gerente pode eliminar produtos")

    const { id } = await ctx.params
    const modo = new URL(req.url).searchParams.get("modo")

    if (modo !== "definitivo") {
      await db.product.update({ where: { id }, data: { active: false } })
      return NextResponse.json({ ok: true, arquivado: true })
    }

    // Eliminação definitiva - verificar histórico ANTES (via variações do produto)
    const variantIds = (
      await db.productVariant.findMany({ where: { productId: id }, select: { id: true } })
    ).map((v) => v.id)

    if (variantIds.length > 0) {
      const [vendas, entradas, quebras] = await Promise.all([
        db.saleItem.count({ where: { variantId: { in: variantIds } } }),
        db.stockEntry.count({ where: { variantId: { in: variantIds } } }),
        db.stockLoss.count({ where: { variantId: { in: variantIds } } }),
      ])
      if (vendas > 0 || entradas > 0 || quebras > 0)
        return NextResponse.json(
          { error: "Este produto tem vendas ou movimentos de stock no histórico e não pode ser eliminado. Use «Arquivar» para o retirar da lista mantendo o histórico." },
          { status: 409 }
        )
    }

    // Sem histórico: apagar (ProductImage e Variantes apagam em cascata pelo schema)
    await db.product.delete({ where: { id } })
    return NextResponse.json({ ok: true, eliminado: true })
  } catch {
    return NextResponse.json({ error: "Erro ao remover produto" }, { status: 500 })
  }
}
