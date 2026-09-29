import { db } from "@/lib/db"

// ============================================================
// v3.0 (M2 da varredura): construtor do payload de backup
// ------------------------------------------------------------
// Era código inline no GET /api/backup - agora é uma função
// reutilizável para que o BACKUP AUTOMÁTICO diário gere
// exactamente o MESMO formato (compatível com o restauro
// existente, meta.app = "CIC-backup"). Nada mudou no formato.
// ============================================================

const APP_TAG = "CIC-backup"

export type BackupPayloadConstruido = {
  payload: Record<string, unknown>
  json: string
}

export async function buildBackupPayload(semFotos: boolean): Promise<BackupPayloadConstruido> {
  const [
    settings, users, counters, products, productVariants, stockEntries,
    stockLosses, customers, creditPayments, sales, saleItems, payments,
    vales, expenses, cashClosings,
  ] = await Promise.all([
    db.settings.findMany(),
    db.user.findMany(),
    db.counter.findMany(),
    db.product.findMany(),
    db.productVariant.findMany(),
    db.stockEntry.findMany(),
    db.stockLoss.findMany(),
    db.customer.findMany(),
    db.creditPayment.findMany(),
    db.sale.findMany(),
    db.saleItem.findMany(),
    db.payment.findMany(),
    db.vale.findMany(),
    db.expense.findMany(),
    db.cashClosing.findMany(),
  ])
  const productImages = semFotos
    ? []
    : await db.productImage.findMany() // v2.4: FOTOS no backup (C2 da auditoria)

  const counts = {
    produtos: products.length,
    variantes: productVariants.length,
    fotos: productImages.length,
    clientes: customers.length,
    vendas: sales.length,
    despesas: expenses.length,
    funcionarios: users.length,
  }

  const payload = {
    meta: { app: APP_TAG, version: 2, exportedAt: new Date().toISOString(), counts, semFotos },
    settings, users, counters, products,
    productVariants, stockEntries, stockLosses,
    customers, creditPayments, sales, saleItems, payments,
    vales, expenses, cashClosings,
    // Bytes → base64 para o JSON (restaurado com Buffer.from)
    productImages: productImages.map((img) => ({
      id: img.id, productId: img.productId, mime: img.mime,
      dados: Buffer.from(img.dados).toString("base64"),
      createdAt: img.createdAt,
    })),
  }
  const json = JSON.stringify(payload)
  return { payload, json }
}

// Limite prático do serverless da Vercel (~4.5MB de resposta)
export const LIMITE_JSON = 4_000_000
