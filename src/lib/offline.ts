// ============================================================
// Motor Offline-First - CIC (resiliência Vodacom/Movitel/Tmcel)
// - Vendas guardadas localmente (localStorage) se a rede cair
// - Catálogo (produtos/clientes) em cache local p/ venda offline
// - Sincronização automática quando a ligação volta
// ============================================================
"use client";

export type OfflineSale = {
  localId: string
  userId: string
  customerId?: string | null
  priceType: "RETALHO" | "GROSSO"
  discount: number
  items: Array<{
    variantId: string
    qty: number
    unitPrice: number
    name: string
    variantLabel?: string | null
  }>
  payments: Array<{
    method: string
    amount: number
    change?: number
    reference?: string
  }>
  clientCreatedAt: string
}

const QUEUE_KEY = "cic_offline_queue_v1"
const CACHE_PRODUCTS = "cic_cache_products_v1"
const CACHE_CUSTOMERS = "cic_cache_customers_v1"
const CACHE_SETTINGS = "cic_cache_settings_v1"
const SUSPENDED_KEY = "cic_suspended_sales_v1"

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as T[]
  } catch {
    return []
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return
  localStorage.setItem(key, JSON.stringify(value))
}

// ---------- Fila de vendas offline ----------
export function getQueue(): OfflineSale[] {
  return read<OfflineSale>(QUEUE_KEY)
}

export function enqueueSale(sale: OfflineSale) {
  const q = getQueue()
  q.push(sale)
  write(QUEUE_KEY, q)
}

export function removeFromQueue(localId: string) {
  write(
    QUEUE_KEY,
    getQueue().filter((s) => s.localId !== localId)
  )
}

export function queueCount(): number {
  return getQueue().length
}

// ---------- Cache de catálogo (para vender offline) ----------
export type CachedVariant = {
  id: string; productId: string; color: string | null; size: string | null
  retailPrice: number; wholesalePrice: number | null; wholesaleMinQty: number
  stock: number; minStock: number; expiryDate: string | null; costPrice: number
  productName: string; productCode: string; category: string; brand: string | null
  active: boolean
}

export function cacheProducts(list: unknown) {
  write(CACHE_PRODUCTS, list as unknown[])
}
export function getCachedProducts(): CachedVariant[] {
  return read<CachedVariant>(CACHE_PRODUCTS)
}

export function cacheCustomers(list: unknown) {
  write(CACHE_CUSTOMERS, list as unknown[])
}
export function getCachedCustomers(): Array<{ id: string; name: string; phone: string | null; creditLimit: number }> {
  return read(CACHE_CUSTOMERS)
}

export function cacheSettings(s: unknown) {
  localStorage.setItem(CACHE_SETTINGS, JSON.stringify(s))
}
export function getCachedSettings(): { storeName: string; phone: string; address: string; receiptFooter: string; thermalWidth: string } | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_SETTINGS) ?? "null")
  } catch {
    return null
  }
}

// ---------- Vendas suspensas (em espera) ----------
export type SuspendedSale = {
  id: string
  label: string
  at: string
  cart: OfflineSale["items"]
  customerId?: string | null
  priceType: "RETALHO" | "GROSSO"
}

export function getSuspended(): SuspendedSale[] {
  return read<SuspendedSale>(SUSPENDED_KEY)
}
export function suspendSale(s: SuspendedSale) {
  const list = getSuspended()
  list.push(s)
  write(SUSPENDED_KEY, list)
}
export function resumeSuspended(id: string): SuspendedSale | null {
  const list = getSuspended()
  const found = list.find((s) => s.id === id) ?? null
  if (found) write(SUSPENDED_KEY, list.filter((s) => s.id !== id))
  return found
}

// ---------- Sincronização ----------
// rejected = vendas que o servidor RECUSOU permanentemente (ex: stock insuficiente
// entretanto, fiação acima do limite). Ficam na lista "rejeitadas" p/ o utilizador
// ver - NÃO voltam a tentar infinitamente como antes.
export type SyncResult = { synced: number; failed: number; rejected: number }

const REJECTED_KEY = "cic_offline_rejected_v1"

export function getRejected(): Array<OfflineSale & { reason: string; at: string }> {
  return read(REJECTED_KEY)
}

function pushRejected(sale: OfflineSale, reason: string) {
  const list = getRejected()
  list.push({ ...sale, reason, at: new Date().toISOString() })
  write(REJECTED_KEY, list)
}

export function clearRejected() {
  write(REJECTED_KEY, [])
}

export async function syncQueue(): Promise<SyncResult> {
  const queue = getQueue()
  if (queue.length === 0) return { synced: 0, failed: 0, rejected: 0 }
  let synced = 0
  let failed = 0
  let rejected = 0
  for (const sale of queue) {
    try {
      // v2.4: timeout de 15s (antes o fetch podia ficar pendurado eternamente
      // em rede meia-morta da Vodacom/Movitel e travar o ciclo de sync)
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 15000)
      let res: Response
      try {
        res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...sale, offline: true }),
          signal: ctrl.signal,
        })
      } finally {
        clearTimeout(timer)
      }
      if (res.ok) {
        removeFromQueue(sale.localId)
        synced++
      } else if (res.status === 400 || res.status === 404 || res.status === 409) {
        // Recusa definitiva do servidor - guardar como rejeitada e tirar da fila
        // (antes ficava a tentar para sempre, a mostrar "pendente" eterno)
        const data = await res.json().catch(() => ({}))
        pushRejected(sale, data.error ?? "Recusada pelo servidor")
        removeFromQueue(sale.localId)
        rejected++
      } else if (res.status === 401) {
        // Sessão expirou a meio da sincronização: NÃO insistir (antes tentava
        // infinitamente). A venda fica na fila; o próximo login sincroniza.
        failed++
        break
      } else {
        failed++
      }
    } catch {
      failed++
      break // rede caiu a meio - tenta no próximo ciclo
    }
  }
  return { synced, failed, rejected }
}
