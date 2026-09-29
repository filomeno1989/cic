import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { round2 } from "@/lib/money"

// GET /api/customers - lista com saldo de fiação (?archived=1 inclui arquivados)

// v3.0 (M3): MAX(timestamp) vem BigInt no SQLite e Date no PostgreSQL -
// esta ponte aceita ambos (e strings ISO de backups antigos)
function paraMs(v: unknown): number {
  if (v == null) return 0
  if (typeof v === "bigint") return Number(v)
  if (typeof v === "number") return v
  const t = new Date(v as string).getTime()
  return Number.isNaN(t) ? 0 : t
}
export async function GET(req: NextRequest) {
  try {
    const includeArchived = new URL(req.url).searchParams.get("archived") === "1"
    // v2.6 (D4 da auditoria): o saldo passou a somar-se NA BASE DE DADOS.
    // Antes carregava TODAS as vendas a crédito + TODAS as amortizações e
    // somava em JavaScript - com anos de história a lista ficava lenta.
    // Agora: 2 agregações SQL (linhas = nº de clientes) + 1 lista de clientes.
    // v3.0 (M3 da varredura): dias em dívida para os lembretes de fiado -
    // dias desde a última movimentação da dívida (compra a crédito ou
    // amortização; o que for mais recente). Em clientes sem amortização,
    // é a idade da dívida desde a compra.
    const [customers, creditedRows, paidRows, ultimaCompraRows, ultimoPagRows] = await Promise.all([
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
      db.$queryRaw<Array<{ cid: string; ultima: Date }>>`
        SELECT s."customerId" AS cid, MAX(s."createdAt") AS ultima
        FROM "Sale" s
        WHERE s.status = 'CONCLUIDA' AND s."isCredit" = TRUE AND s."customerId" IS NOT NULL
        GROUP BY s."customerId"`,
      db.creditPayment.groupBy({ by: ["customerId"], _max: { date: true } }),
    ])
    const credit = new Map<string, number>()
    for (const r of creditedRows) credit.set(r.cid, round2(Number(r.credited)))
    const paid = new Map<string, number>()
    for (const p of paidRows) paid.set(p.customerId, round2(p._sum.amount ?? 0))
    const ultimaCompra = new Map<string, number>()
    for (const r of ultimaCompraRows) ultimaCompra.set(r.cid, paraMs(r.ultima))
    const ultimoPag = new Map<string, number>()
    for (const p of ultimoPagRows) if (p._max.date) ultimoPag.set(p.customerId, paraMs(p._max.date))
    const agora = Date.now()
    return NextResponse.json(
      customers.map((c) => {
        const balance = round2((credit.get(c.id) ?? 0) - (paid.get(c.id) ?? 0))
        // dias em dívida: desde a última movimentação da dívida (compra ou amortização)
        let diasFiado: number | null = null
        if (balance > 0.009) {
          const ultimaMov = Math.max(ultimaCompra.get(c.id) ?? 0, ultimoPag.get(c.id) ?? 0)
          if (ultimaMov > 0) diasFiado = Math.max(0, Math.floor((agora - ultimaMov) / 86400000))
        }
        return { ...c, balance, diasFiado }
      })
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
