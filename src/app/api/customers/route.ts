import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// Saldo de fiação = vendas a crédito (não anuladas) − amortizações
function computeBalances(
  customers: Array<{ id: string }>,
  sales: Array<{ customerId: string | null; isCredit: boolean; payments: Array<{ method: string; amount: number }> }>,
  pays: Array<{ customerId: string; amount: number }>
) {
  const credit = new Map<string, number>()
  for (const s of sales) {
    if (!s.customerId || !s.isCredit) continue
    const creditoTotal = s.payments
      .filter((p) => p.method === "CREDITO")
      .reduce((acc, p) => acc + p.amount, 0)
    credit.set(s.customerId, (credit.get(s.customerId) ?? 0) + creditoTotal)
  }
  const paid = new Map<string, number>()
  for (const p of pays) {
    paid.set(p.customerId, (paid.get(p.customerId) ?? 0) + p.amount)
  }
  const map = new Map<string, number>()
  for (const c of customers) {
    map.set(c.id, (credit.get(c.id) ?? 0) - (paid.get(c.id) ?? 0))
  }
  return map
}

// GET /api/customers - lista com saldo de fiação (?archived=1 inclui arquivados)
export async function GET(req: NextRequest) {
  try {
    const includeArchived = new URL(req.url).searchParams.get("archived") === "1"
    const [customers, sales, pays] = await Promise.all([
      db.customer.findMany({
        where: includeArchived ? {} : { active: true },
        orderBy: { name: "asc" },
      }),
      db.sale.findMany({
        where: { isCredit: true, status: "CONCLUIDA" },
        select: { customerId: true, isCredit: true, payments: { select: { method: true, amount: true } } },
      }),
      db.creditPayment.findMany({ select: { customerId: true, amount: true } }),
    ])
    const balances = computeBalances(customers, sales, pays)
    return NextResponse.json(
      customers.map((c) => ({ ...c, balance: balances.get(c.id) ?? 0 }))
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
