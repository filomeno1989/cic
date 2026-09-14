import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// PUT /api/products/[id] - atualizar produto e/ou variações
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
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

// DELETE /api/products/[id] - desativar produto (soft delete)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    await db.product.update({ where: { id }, data: { active: false } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao remover produto" }, { status: 500 })
  }
}
