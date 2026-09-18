import { NextResponse } from "next/server"
import { db } from "@/lib/db"

/*
 * GET /api/loja/config - PÚBLICO: dados de apresentação do portal /loja.
 * Só devolve o que é público (nome, endereço, telefone, WhatsApp, rodapé,
 * links das redes sociais para os botões «Siga-nos»).
 */
export async function GET() {
  try {
    let settings = await db.settings.findUnique({ where: { id: "main" } })
    if (!settings) settings = await db.settings.create({ data: { id: "main" } })
    return NextResponse.json({
      storeName: settings.storeName,
      address: settings.address,
      phone: settings.phone,
      whatsappLoja: settings.whatsappLoja || "",
      receiptFooter: settings.receiptFooter,
      instagramUrl: settings.instagramUrl || "",
      facebookUrl: settings.facebookUrl || "",
      tiktokUrl: settings.tiktokUrl || "",
    })
  } catch {
    return NextResponse.json(
      { storeName: "CIC Fragrâncias & Glamour", address: "Beira, Moçambique", phone: "", whatsappLoja: "", receiptFooter: "Obrigado pela preferência!", instagramUrl: "", facebookUrl: "", tiktokUrl: "" }
    )
  }
}
