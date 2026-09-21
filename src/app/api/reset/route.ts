import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth"
import { pinConfere, pinLookupHmac } from "@/lib/pin"

/*
 * POST /api/reset - limpar TODA a base de dados (só gerente, com PIN).
 * Mantém: contas de GERENTE e as definições da loja (nome, telefone, categorias...).
 * Apaga: produtos, variações, stock, clientes, fiação, vendas, despesas, vales,
 *        fechos, contadores e funcionários de caixa - recomeça a numeração em #00001.
 */

export async function POST(req: NextRequest) {
  try {
    const { pin } = (await req.json()) as { pin?: string }

    const session = await getSessionUser(req)
    if (!session) return unauthorized()
    if (session.role !== "GERENTE")
      return forbidden("Apenas o gerente pode limpar a base de dados")

    // v2.5 (S5): PIN conferido contra hash (scrypt) / legado - nunca por texto na BD
    const gerente =
      (await db.user.findFirst({
        where: { pinLookup: pinLookupHmac(String(pin ?? "")), role: "GERENTE", active: true },
        select: { id: true, pinHash: true, pin: true },
      })) ??
      (await db.user.findFirst({
        where: { pin: String(pin ?? ""), role: "GERENTE", active: true },
        select: { id: true, pinHash: true, pin: true },
      }))
    if (!gerente || !pinConfere(String(pin ?? ""), gerente))
      return NextResponse.json({ error: "PIN de gerente incorreto" }, { status: 401 })

    await db.$transaction(async (tx) => {
      // 1) apagar na ordem inversa de dependências
      await tx.creditPayment.deleteMany({})
      await tx.payment.deleteMany({})
      await tx.saleItem.deleteMany({})
      await tx.sale.deleteMany({})
      await tx.stockEntry.deleteMany({})
      await tx.stockLoss.deleteMany({})
      await tx.productVariant.deleteMany({})
      await tx.product.deleteMany({})
      await tx.customer.deleteMany({})
      await tx.vale.deleteMany({})
      await tx.expense.deleteMany({})
      await tx.cashClosing.deleteMany({})
      await tx.counter.deleteMany({})
      await tx.user.deleteMany({ where: { role: { not: "GERENTE" } } })

      // 2) recomeçar a numeração de vendas
      await tx.counter.create({ data: { id: "sale", saleNumber: 0 } })
    })

    return NextResponse.json({
      ok: true,
      message: "Base de dados limpa. Pode começar a registar os seus produtos, clientes e funcionários.",
    })
  } catch {
    return NextResponse.json({ error: "Erro ao limpar a base de dados" }, { status: 500 })
  }
}
