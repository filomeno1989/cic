import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { round2 } from "@/lib/money"

// GET /api/customers - lista com saldo de fiação (?archived=1 inclui arquivados)
export async function GET(req: NextRequest) {
  try {
    const includeArchived = new URL(req.url).searchParams.get("archived") === "1"
    // v2.6 (D4 da auditoria): o saldo passou a somar-se NA BASE DE DADOS.
    // Antes carregava TODAS as vendas a crédito + TODAS as amortizações e
    // somava em JavaScript - com anos de história a lista ficava lenta.
    // Agora: 2 agregações SQL (linhas = nº de clientes) + 1 lista de clientes.
    const [customers, creditedRows, paidRows] = await Promise.all([
      db.customer.findMany({
        where: includeArchived ? {} : { active: true },
        orderBy: { name: "asc" },
      }),
      db.$queryRaw<Array<{ cid: string; credited: number }>>`
        SELECT s."customerId" AS cid, COALESCE(SUM(p.amount), 0) AS credited
        FROM "Payment" p
        JOIN "Sale" s ON s.id = p."saleId"
        WHERE p.method = 'CREDITO' AND s.status = 'CONCLUIDA' AND s."isCredit" = TRUE
          AND s."customerId" IS NOT NULL
        GROUP BY s."customerId"`,
      db.creditPayment.groupBy({ by: ["customerId"], _sum: { amount: true } }),
    ])
    const credit = new Map<string, number>()
    for (const r of creditedRows) credit.set(r.cid, round2(Number(r.credited)))
    const paid = new Map<string, number>()
    for (const p of paidRows) paid.set(p.customerId, round2(p._sum.amount ?? 0))
    return NextResponse.json(
      customers.map((c) => ({ ...c, balance: round2((credit.get(c.id) ?? 0) - (paid.get(c.id) ?? 0)) }))
    )
  } catch {
    return NextResponse.json({ error: "Erro ao carregar clientes" }, { status: 500 })
  }
}

// POST /api/customers - criar cliente
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, phone, creditLimit, notes } = body
    if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 })
    const customer = await db.customer.create({
      data: {
        name,
        phone: phone || null,
        creditLimit: Number(creditLimit) || 0,
        notes: notes || null,
      },
    })
    return NextResponse.json({ ...customer, balance: 0 })
  } catch {
    return NextResponse.json({ error: "Erro ao criar cliente" }, { status: 500 })
  }
}
