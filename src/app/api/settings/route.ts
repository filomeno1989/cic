import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_PRODUCT_CATEGORIES, DEFAULT_PRODUCT_BRANDS, parseCategories } from "@/lib/format"

// GET /api/settings - dados da loja + listas (despesas fixas, categorias e marcas de produtos)
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
      productBrands: parseCategories(settings.productBrands, DEFAULT_PRODUCT_BRANDS),
    })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar definições" }, { status: 500 })
  }
}

// v2.5 (S4 da auditoria): URLs sociais viram links clicáveis no portal público
// /loja - um valor tipo "javascript:..." seria executado no aparelho do cliente.
// Só aceita https:// e domínios oficiais das redes (ou vazio = remover).
function urlSocialValido(valor: unknown): boolean {
  if (valor === undefined) return true
  if (typeof valor !== "string") return false
  const v = valor.trim()
  if (!v) return true // vazio = limpar o campo
  try {
    const u = new URL(v)
    const dom = u.hostname.toLowerCase().replace(/^www\./, "")
    return (
      u.protocol === "https:" &&
      (dom === "instagram.com" || dom.endsWith(".instagram.com") ||
       dom === "facebook.com" || dom.endsWith(".facebook.com") ||
       dom === "fb.com" || dom.endsWith(".fb.com") ||
       dom === "tiktok.com" || dom.endsWith(".tiktok.com"))
    )
  } catch {
    return false
  }
}

// PUT /api/settings - atualizar (só gerente - papel validado na SESSÃO)
export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE") return forbidden()

    const body = await req.json()
    const { storeName, phone, address, receiptFooter, thermalWidth, nuit, expenseCategories, productCategories, productBrands, whatsappLoja, instagramUrl, facebookUrl, tiktokUrl } = body

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
    const brandJson =
      productBrands === undefined
        ? undefined
        : Array.isArray(productBrands) && productBrands.every((c: unknown) => typeof c === "string" && c.trim())
          ? JSON.stringify([...new Set((productBrands as string[]).map((c) => c.trim()))])
          : null

    if (expenseJson === null || productJson === null || brandJson === null)
      return NextResponse.json({ error: "Lista inválida" }, { status: 400 })

    // v2.5 (S4): rejeitar URLs que não sejam https de Instagram/Facebook/TikTok
    if (!urlSocialValido(instagramUrl) || !urlSocialValido(facebookUrl) || !urlSocialValido(tiktokUrl))
      return NextResponse.json(
        { error: "Link inválido. Use o endereço completo da rede (ex.: https://instagram.com/aloja) ou deixe vazio." },
        { status: 400 }
      )

    const settings = await db.settings.upsert({
      where: { id: "main" },
      update: {
        ...(storeName && { storeName }),
        ...(phone !== undefined && { phone: phone || "" }),
        ...(address !== undefined && { address: address || "" }),
        ...(receiptFooter !== undefined && { receiptFooter: receiptFooter || "" }),
        ...(thermalWidth && { thermalWidth: thermalWidth === "58" ? "58" : "80" }),
        ...(nuit !== undefined && { nuit: nuit || "" }),
        ...(whatsappLoja !== undefined && { whatsappLoja: typeof whatsappLoja === "string" ? whatsappLoja.trim() : "" }),
        ...(instagramUrl !== undefined && { instagramUrl: typeof instagramUrl === "string" ? instagramUrl.trim() : "" }),
        ...(facebookUrl !== undefined && { facebookUrl: typeof facebookUrl === "string" ? facebookUrl.trim() : "" }),
        ...(tiktokUrl !== undefined && { tiktokUrl: typeof tiktokUrl === "string" ? tiktokUrl.trim() : "" }),
        ...(expenseJson !== undefined && { expenseCategories: expenseJson }),
        ...(productJson !== undefined && { productCategories: productJson }),
        ...(brandJson !== undefined && { productBrands: brandJson }),
      },
      create: {
        id: "main",
        ...(whatsappLoja !== undefined && { whatsappLoja: typeof whatsappLoja === "string" ? whatsappLoja.trim() : "" }),
        ...(instagramUrl !== undefined && { instagramUrl: typeof instagramUrl === "string" ? instagramUrl.trim() : "" }),
        ...(facebookUrl !== undefined && { facebookUrl: typeof facebookUrl === "string" ? facebookUrl.trim() : "" }),
        ...(tiktokUrl !== undefined && { tiktokUrl: typeof tiktokUrl === "string" ? tiktokUrl.trim() : "" }),
      },
    })
    return NextResponse.json({
      ...settings,
      expenseCategories: parseCategories(settings.expenseCategories, DEFAULT_EXPENSE_CATEGORIES),
      productCategories: parseCategories(settings.productCategories, DEFAULT_PRODUCT_CATEGORIES),
      productBrands: parseCategories(settings.productBrands, DEFAULT_PRODUCT_BRANDS),
    })
  } catch {
    return NextResponse.json({ error: "Erro ao guardar definições" }, { status: 500 })
  }
}
