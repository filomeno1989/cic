// Formatação monetária e datas - Moçambique (MT)
export function mt(value: number | null | undefined): string {
  const v = value ?? 0
  return (
    new Intl.NumberFormat("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v) + " MT"
  )
}

export function mtShort(value: number): string {
  if (Math.abs(value) >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M MT"
  if (Math.abs(value) >= 1_000) return (value / 1_000).toFixed(1) + "k MT"
  return mt(value)
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "-"
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "-"
  const date = typeof d === "string" ? new Date(d) : d
  return (
    date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }) +
    " " +
    date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
  )
}

export function daysUntil(d: string | Date | null | undefined): number | null {
  if (!d) return null
  const date = typeof d === "string" ? new Date(d) : d
  const diff = date.getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function variantLabel(v: { color?: string | null; size?: string | null }): string {
  return [v.color, v.size].filter(Boolean).join(" · ")
}

// Normaliza número de telefone Moçambique para wa.me (258...)
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  let p = phone.replace(/\D/g, "")
  if (p.startsWith("258")) return p
  if (p.startsWith("0")) return "258" + p.slice(1)
  if (p.length === 9) return "258" + p
  return p || null
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const n = waNumber(phone)
  if (!n) return null
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

export const PAYMENT_METHODS = [
  { value: "DINHEIRO", label: "Dinheiro", hint: "Troco automático" },
  { value: "MPESA", label: "M-Pesa", hint: "Vodacom" },
  { value: "EMOLA", label: "e-Mola", hint: "Movitel" },
  { value: "MKESH", label: "mKesh", hint: "Tmcel" },
  { value: "POS", label: "POS / Cartão", hint: "Millennium BIM, BCI, Standard Bank" },
  { value: "CREDITO", label: "Fiação", hint: "Crédito na loja" },
] as const

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Renda",
  "Salários",
  "INSS",
  "Contabilista",
  "Credelec (Energia)",
  "FIPAG (Água)",
  "Conselho Municipal (Taxas/Lixo)",
  "Transporte/Chapa/Txopela",
  "Alimentação/Água da loja",
  "Saldo/Net (Router)",
  "Embalagens & Sacos",
  "Publicidade",
  "Manutenção",
  "Outras",
]

// Lista sugerida p/ loja de cosméticos, perfumaria e acessórios (Beira)
export const DEFAULT_PRODUCT_CATEGORIES = [
  "Perfumes (Dama)",
  "Perfumes (Homem)",
  "Cremes & Loções",
  "Óleos Corporais",
  "Cabelo - Shampoo & Condicionador",
  "Cabelo - Cremes & Máscaras",
  "Cabelo - Relaxantes & Alisantes",
  "Cabelo - Óleos & Perfumes capilares",
  "Maquilhagem - Rosto",
  "Maquilhagem - Lábios",
  "Maquilhagem - Olhos",
  "Unhas - Vernizes",
  "Unhas - Acrígelos & Acessórios",
  "Corpo & Banho",
  "Sabonetes",
  "Desodorizantes",
  "Higiene & Cuidado Íntimo",
  "Proteção Solar",
  "Produtos de Bebé",
  "Barbearia & Pós-Barba",
  "Acessórios de Cabelo",
  "Bijuteria & Brincos",
  "Bolsas & Carteiras",
  "Perfumaria de Ambiente",
  "Outros",
]

// Lista sugerida de MARCAS (a marca é diferente da categoria - ex: categoria "Perfumes (Dama)", marca "Zara")
export const DEFAULT_PRODUCT_BRANDS = [
  "Zara",
  "Dior",
  "Chanel",
  "Versace",
  "Calvin Klein",
  "Carolina Herrera",
  "Paco Rabanne",
  "Lancôme",
  "L'Oréal",
  "Garnier",
  "Maybelline",
  "Revlon",
  "Nivea",
  "Vaseline",
  "Dove",
  "Eudora",
  "O Boticário",
  "Avon",
  "Yves Rocher",
  "Rubis",
  "Bi-Ol",
  "Ambar",
  "Sally Hansen",
  "Bath & Body Works",
]

export function parseCategories(json: string | null | undefined, fallback: string[]): string[] {
  try {
    const arr = json ? (JSON.parse(json) as unknown) : null
    if (Array.isArray(arr) && arr.length > 0 && arr.every((x) => typeof x === "string")) return arr as string[]
  } catch { /* usa predefinido */ }
  return fallback
}

export const LOSS_REASONS = [
  { value: "AJUSTE", label: "Ajuste de contagem" }, // v2.4: correção de stock (usada pelo botão Ajustar)
  { value: "DERRETEU", label: "Derreteu/Avariou" },
  { value: "PARTIU", label: "Partiu-se" },
  { value: "EXPIROU", label: "Expirou" },
  { value: "ROUBO", label: "Roubo/Extravio" },
  { value: "OUTRO", label: "Outro motivo" },
]

export function methodLabel(m: string): string {
  return PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m
}
