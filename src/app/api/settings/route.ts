import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_PRODUCT_CATEGORIES, parseCategories } from "@/lib/format"

// GET /api/settings - dados da loja + listas de categorias (despesas fixas e produtos)
export async function GET() {
  try {
    let settings = await db.settings.findUnique({ where: { id: "main" } })
    if (!settings) {
      settings = await db.settings.create({ data: { id: "main" } })
    }
    return NextResponse.json({
      ...settings,
      expenseCategories: parseCategories(settings.expenseCategories, DEFAULT_EXPENSE_CATEGORIES),
      productCategories: parseCategories(settings.productCategories, DEFAULT_PRODUCT_CATEGORIES),
    })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar definições" }, { status: 500 })
  }
}

// PUT /api/settings - atualizar (só gerente - papel validado na SESSÃO)
export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden()

    const body = await req.json()
    const { storeName, phone, address, receiptFooter, thermalWidth, nuit, expenseCategories, productCategories } = body

    // Categorias: devem ser arrays de strings (podem vir apenas uma das listas)
    const expenseJson =
      expenseCategories === undefined
        ? undefined
        : Array.isArray(expenseCategories) && expenseCategories.every((c: unknown) => typeof c === "string" && c.trim())
          ? JSON.stringify([...new Set((expenseCategories as string[]).map((c) => c.trim()))])
          : null
    const productJson =
      productCategories === undefined
        ? undefined
        : Array.isArray(productCategories) && productCategories.every((c: unknown) => typeof c === "string" && c.trim())
          ? JSON.stringify([...new Set((productCategories as string[]).map((c) => c.trim()))])
          : null

    if (expenseJson === null || productJson === null)
      return NextResponse.json({ error: "Lista de categorias inválida" }, { status: 400 })

    const settings = await db.settings.upsert({
      where: { id: "main" },
      update: {
        ...(storeName && { storeName }),
        ...(phone !== undefined && { phone: phone || "" }),
        ...(address !== undefined && { address: address || "" }),
        ...(receiptFooter !== undefined && { receiptFooter: receiptFooter || "" }),
        ...(thermalWidth && { thermalWidth: thermalWidth === "58" ? "58" : "80" }),
        ...(nuit !== undefined && { nuit: nuit || "" }),
        ...(expenseJson !== undefined && { expenseCategories: expenseJson }),
        ...(productJson !== undefined && { productCategories: productJson }),
      },
      create: { id: "main" },
    })
    return NextResponse.json({
      ...settings,
      expenseCategories: parseCategories(settings.expenseCategories, DEFAULT_EXPENSE_CATEGORIES),
      productCategories: parseCategories(settings.productCategories, DEFAULT_PRODUCT_CATEGORIES),
    })
  } catch {
    return NextResponse.json({ error: "Erro ao guardar definições" }, { status: 500 })
  }
}
