"use client";

// Tipos partilhados do sistema CIC
export type SessionUser = {
  id: string
  name: string
  role: "GERENTE" | "CAIXA"
  commissionPct: number
  baseSalary: number
  phone?: string | null
}

export type ProductVariantFlat = {
  id: string
  productId: string
  productName: string
  productCode: string
  category: string
  brand: string | null
  color: string | null
  size: string | null
  costPrice: number
  retailPrice: number
  wholesalePrice: number | null
  wholesaleMinQty: number
  stock: number
  minStock: number
  expiryDate: string | null
  active: boolean
}

export type CartItem = {
  variantId: string
  name: string
  variantLabel: string
  qty: number
  unitPrice: number
  stock: number
}

export type CustomerFlat = {
  id: string
  name: string
  phone: string | null
  creditLimit: number
  notes?: string | null
  balance: number
  active?: boolean
}

export type SaleFlat = {
  id: string
  number: number
  userId: string
  user?: { name: string }
  customer?: { name: string; phone: string | null } | null
  subtotal: number
  discount: number
  total: number
  status: string
  isCredit: boolean
  priceType: string
  commission: number
  offline?: boolean
  clientCreatedAt?: string | null
  createdAt: string
  items: Array<{ id: string; name: string; variantLabel: string | null; qty: number; unitPrice: number; total: number }>
  payments: Array<{ id: string; method: string; amount: number; change: number; reference?: string | null }>
}
