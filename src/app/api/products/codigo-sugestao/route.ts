import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

/*
 * GET /api/products/codigo-sugestao?prefixo=CART
 *
 * P2: sugestão automática de código livre. Escreveu "CART" → devolve
 * "CART 05" se CART 01..04 já existirem (procura o número máximo usado
 * e soma 1, com 2 dígitos). Ignora espaços/traços e maiúsculas/minúsculas:
 * "cart5" e "CART 05" contam ambos como o número 5 do prefixo CART.
 */
export async function GET(req: NextRequest) {
  try {
    const raw = (req.nextUrl.searchParams.get("prefixo") ?? "").toUpperCase().trim()
    // Prefixo = texto inicial sem os dígitos finais nem separadores ("CART 0" → "CART")
    const prefix = raw.replace(/[\d\s\-_/]+$/, "").replace(/[^A-Z0-9]/g, "")
    if (prefix.length < 1 || prefix.length > 12) {
      return NextResponse.json({ sugestao: null })
    }

    const rows = await db.product.findMany({
      where: { code: { startsWith: prefix } },
      select: { code: true },
    })

    // Códigos usados, normalizados: "CART 05" / "cart5" / "CART-5" → CART|5
    const usados = new Set<string>()
    let maxNum = 0
    const re = new RegExp(`^${prefix}[\\s\\-_/.]*0*(\\d+)$`)
    for (const { code } of rows) {
      const up = code.toUpperCase().trim()
      usados.add(up.replace(/[\s\-_/.]+/g, ""))
      const m = re.exec(up)
      if (m) {
        const n = parseInt(m[1], 10)
        if (Number.isFinite(n) && n > maxNum) maxNum = n
      }
    }

    // Próximo número livre (garante que o sugerido nunca está ocupado)
    let n = Math.max(1, maxNum + 1)
    let sugestao = `${prefix} ${String(n).padStart(2, "0")}`
    for (let guard = 0; guard < 900 && usados.has(sugestao.replace(/[\s\-_/.]+/g, "")); guard++) {
      n += 1
      sugestao = `${prefix} ${String(n).padStart(2, "0")}`
    }
    return NextResponse.json({ sugestao })
  } catch {
    return NextResponse.json({ sugestao: null }, { status: 200 })
  }
}
