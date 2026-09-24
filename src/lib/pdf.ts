"use client";

// Relatórios em PDF - CIC Fragrâncias & Glamour (gerados no dispositivo, funcionam offline)
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type PdfStore = { storeName: string; phone: string; address: string };

// ---- Paleta da marca ----
const GOLD: [number, number, number] = [176, 141, 40];
const GOLD_LIGHT: [number, number, number] = [247, 243, 231];
const DARK: [number, number, number] = [26, 26, 26];
const GRAY: [number, number, number] = [115, 115, 115];
const LINE: [number, number, number] = [225, 220, 205];
const RED: [number, number, number] = [186, 26, 60];
const GREEN: [number, number, number] = [22, 128, 82];

const money = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0) + " MT";

const fmtD = (v: string | Date | null | undefined) => {
  if (!v) return "-";
  const d = typeof v === "string" ? new Date(v) : v;
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const fmtDT = (v: string | Date | null | undefined) => {
  if (!v) return "-";
  const d = typeof v === "string" ? new Date(v) : v;
  if (isNaN(d.getTime())) return "-";
  return fmtD(d) + " " + d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
};

export const METHOD_LABELS: Record<string, string> = {
  DINHEIRO: "Dinheiro", MPESA: "M-Pesa", EMOLA: "e-Mola", MKESH: "mKesh",
  POS: "POS/Cartão", CREDITO: "Fiação",
};

let logoCache: string | null | undefined;

async function loadLogo(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    const res = await fetch("/logo-cic-small.png");
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    logoCache = await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve((r.result as string) || null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    logoCache = null;
  }
  return logoCache;
}

type DocCtx = { doc: jsPDF; store: PdfStore; title: string; period: string; by: string };

async function buildCtx(store: PdfStore, title: string, period: string, by: string): Promise<DocCtx> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ctx = { doc, store, title, period, by };
  drawPageHeader(ctx, true);
  return ctx;
}

function drawPageHeader(ctx: DocCtx, withLogo: boolean) {
  const { doc, store, title, period } = ctx;
  const W = doc.internal.pageSize.getWidth();

  // Cabeçalho
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, 30, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 30, W, 1.2, "F");

  const logo = logoCache; // já carregado por buildCtx (ou null)
  if (withLogo && logo) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.circle(18, 15, 9, "F");
      doc.addImage(logo, "PNG", 11.5, 8.5, 13, 13);
    } catch { /* logo opcional */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(store.storeName || "CIC Fragrâncias & Glamour", withLogo && logo ? 30 : 14, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(210, 210, 210);
  const contact = [store.address, store.phone].filter(Boolean).join("  ·  ");
  doc.text(contact || "Beira, Moçambique", withLogo && logo ? 30 : 14, 19);
  doc.text("Sistema de Gestão · PDV & Inventário", withLogo && logo ? 30 : 14, 24);

  // Título do relatório à direita
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 235, 170);
  doc.text(title.toUpperCase(), W - 14, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(200, 200, 200);
  doc.text(period, W - 14, 19, { align: "right" });
}

function finishDoc(ctx: DocCtx, filename: string) {
  const { doc, store, title } = ctx;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (i > 1) drawPageHeader(ctx, false);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(14, H - 12, W - 14, H - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(`${store.storeName} · ${title}`, 14, H - 8);
    doc.text(`Página ${i} de ${total}`, W - 14, H - 8, { align: "right" });
  }
  doc.save(filename);
}

function stampLine(ctx: DocCtx, y: number): number {
  const { doc } = ctx;
  const W = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text(`Emitido em ${fmtDT(new Date())}${ctx.by ? ` por ${ctx.by}` : ""}`, W - 14, y, { align: "right" });
  return y + 4;
}

// Bloco de totais (cartões simples)
function summaryBoxes(ctx: DocCtx, y: number, items: Array<{ label: string; value: string; color?: [number, number, number] }>): number {
  const { doc } = ctx;
  const W = doc.internal.pageSize.getWidth();
  const n = items.length;
  const gap = 4;
  const bw = (W - 28 - gap * (n - 1)) / n;
  const bh = 16;
  let x = 14;
  for (const it of items) {
    doc.setFillColor(...GOLD_LIGHT);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, bw, bh, 1.5, 1.5, "FD");
    doc.setFillColor(...GOLD);
    doc.rect(x, y, 1.2, bh, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(it.label.toUpperCase(), x + 4, y + 5.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...(it.color ?? DARK));
    doc.text(it.value, x + 4, y + 12);
    x += bw + gap;
  }
  return y + bh + 6;
}

const lastY = (doc: jsPDF, fallback: number) =>
  ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback);

// =============== 1. VENDAS ===============
export type PdfSale = {
  number: number; createdAt: string; clientCreatedAt?: string | null;
  status: string; total: number; discount?: number;
  seller?: string; customerName?: string | null;
  items?: Array<{ name: string; qty: number; variantLabel?: string | null }>;
  payments?: Array<{ method: string; amount: number }>;
  isCredit?: boolean; offline?: boolean;
};

export async function salesReportPdf(opts: {
  store: PdfStore; sales: PdfSale[]; fromLabel: string; toLabel: string; generatedBy: string;
}) {
  const { store, sales, fromLabel, toLabel, generatedBy } = opts;
  await loadLogo();
  const ctx = await buildCtx(store, "Relatório de Vendas", `${fromLabel} a ${toLabel}`, generatedBy);
  const { doc } = ctx;
  let y = 40;
  y = stampLine(ctx, y);

  const ok = sales.filter((s) => s.status === "CONCLUIDA");
  const voided = sales.filter((s) => s.status === "ANULADA");
  const total = ok.reduce((a, s) => a + s.total, 0);
  const byMethod = new Map<string, { count: number; total: number }>();
  for (const s of ok) for (const p of s.payments ?? []) {
    const cur = byMethod.get(p.method) ?? { count: 0, total: 0 };
    cur.count++; cur.total += p.amount;
    byMethod.set(p.method, cur);
  }

  y = summaryBoxes(ctx, y, [
    { label: "Vendas concluídas", value: String(ok.length) },
    { label: "Total facturado", value: money(total), color: GREEN },
    { label: "Ticket médio", value: money(ok.length ? total / ok.length : 0) },
    { label: "Anuladas", value: `${voided.length} (${money(voided.reduce((a, s) => a + s.total, 0))})`, color: RED },
  ]);

  // Pagamentos por método
  autoTable(doc, {
    startY: y,
    head: [["Forma de pagamento", "Nº", "Total recebido"]],
    body: [...byMethod.entries()].map(([m, v]) => [METHOD_LABELS[m] ?? m, String(v.count), money(v.total)]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.8, lineColor: LINE, textColor: DARK },
    headStyles: { fillColor: GOLD, textColor: DARK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 250, 245] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right", fontStyle: "bold" } },
    margin: { left: 14, right: 14 },
  });
  y = lastY(doc, y) + 6;

  // Detalhe
  autoTable(doc, {
    startY: y,
    head: [["Nº", "Data", "Vendedor", "Cliente", "Artigos", "Pagamento", "Estado", "Total"]],
    body: [...ok, ...voided]
      .sort((a, b) => (b.clientCreatedAt ?? b.createdAt).localeCompare(a.clientCreatedAt ?? a.createdAt))
      .slice(0, 400)
      .map((s) => [
        "#" + String(s.number).padStart(5, "0"),
        fmtDT(s.clientCreatedAt ?? s.createdAt),
        s.seller ?? "-",
        s.customerName ?? "-",
        (s.items ?? []).map((i) => `${i.qty}x ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""}`).join(", ").slice(0, 120),
        (s.payments ?? []).map((p) => METHOD_LABELS[p.method] ?? p.method).join(" + "),
        s.status === "ANULADA" ? "ANULADA" : "OK",
        money(s.total),
      ]),
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: LINE, textColor: DARK },
    headStyles: { fillColor: GOLD, textColor: DARK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 250, 245] },
    columnStyles: {
      0: { cellWidth: 15 }, 1: { cellWidth: 22 }, 2: { cellWidth: 20 }, 3: { cellWidth: 24 },
      5: { cellWidth: 24 }, 6: { cellWidth: 13, halign: "center", fontStyle: "bold" }, 7: { cellWidth: 21, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && String((data.row.raw as string[] | undefined)?.[6]).includes("ANULADA"))
        data.cell.styles.textColor = RED;
    },
    margin: { left: 14, right: 14 },
  });

  finishDoc(ctx, `vendas-cic-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// =============== 2. FIAÇÃO / DEVEDORES ===============
export async function debtorsReportPdf(opts: {
  store: PdfStore; customers: Array<{ name: string; phone: string | null; creditLimit: number; balance: number; active?: boolean }>;
  generatedBy: string;
}) {
  const { store, customers, generatedBy } = opts;
  await loadLogo();
  const ctx = await buildCtx(store, "Relatório de Fiação", `Devedores · ${fmtD(new Date())}`, generatedBy);
  const { doc } = ctx;
  let y = 40;
  y = stampLine(ctx, y);

  const debtors = customers.filter((c) => c.balance > 0.009).sort((a, b) => b.balance - a.balance);
  const totalDebt = debtors.reduce((a, c) => a + c.balance, 0);

  y = summaryBoxes(ctx, y, [
    { label: "Clientes devedores", value: String(debtors.length) },
    { label: "Total a receber", value: money(totalDebt), color: RED },
    { label: "Maior dívida", value: debtors.length ? money(debtors[0].balance) : money(0) },
    { label: "Na lista", value: `${customers.length} clientes` },
  ]);

  autoTable(doc, {
    startY: y,
    head: [["#", "Cliente", "WhatsApp", "Limite fiação", "Saldo devedor", "% do limite"]],
    body: debtors.map((c, i) => [
      String(i + 1), c.name, c.phone ?? "-", money(c.creditLimit), money(c.balance),
      c.creditLimit > 0 ? Math.min(999, Math.round((c.balance / c.creditLimit) * 100)) + "%" : "-",
    ]),
    foot: [["", "", "", "TOTAL A RECEBER", money(totalDebt), ""]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.8, lineColor: LINE, textColor: DARK },
    headStyles: { fillColor: GOLD, textColor: DARK, fontStyle: "bold" },
    footStyles: { fillColor: DARK, textColor: [255, 235, 170], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 250, 245] },
    columnStyles: { 0: { cellWidth: 10 }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold", textColor: RED }, 5: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  finishDoc(ctx, `fiacao-cic-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// =============== 3. STOCK / INVENTÁRIO ===============
export type PdfVariant = {
  productCode: string; productName: string; color: string | null; size: string | null;
  category: string; brand?: string | null; stock: number; minStock: number;
  costPrice: number; retailPrice: number; wholesalePrice: number | null; expiryDate: string | null;
};

export async function stockReportPdf(opts: { store: PdfStore; variants: PdfVariant[]; generatedBy: string }) {
  const { store, variants, generatedBy } = opts;
  await loadLogo();
  const ctx = await buildCtx(store, "Relatório de Stock", `Inventário · ${fmtD(new Date())}`, generatedBy);
  const { doc } = ctx;
  let y = 40;
  y = stampLine(ctx, y);

  const stockValue = variants.reduce((a, v) => a + v.stock * v.costPrice, 0);
  const retailValue = variants.reduce((a, v) => a + v.stock * v.retailPrice, 0);
  const units = variants.reduce((a, v) => a + v.stock, 0);
  const low = variants.filter((v) => v.stock <= v.minStock);
  const in90 = variants.filter((v) => {
    if (!v.expiryDate) return false;
    const days = (new Date(v.expiryDate).getTime() - Date.now()) / 86400000;
    return days <= 90;
  });

  y = summaryBoxes(ctx, y, [
    { label: "Referências", value: String(variants.length) },
    { label: "Unidades", value: String(units) },
    { label: "Valor (custo)", value: money(stockValue) },
    { label: "Valor (retalho)", value: money(retailValue), color: GREEN },
  ]);
  y = summaryBoxes(ctx, y, [
    { label: "Stock baixo (≤ mín.)", value: `${low.length}`, color: low.length ? RED : DARK },
    { label: "Validade ≤ 90 dias", value: `${in90.length}`, color: in90.length ? RED : DARK },
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Código", "Produto", "Variante", "Stock", "Mín", "Custo", "Retalho", "Validade"]],
    body: variants
      .slice()
      .sort((a, b) => a.productName.localeCompare(b.productName))
      .map((v) => [
        v.productCode, v.productName + (v.brand ? ` · ${v.brand}` : ""),
        [v.color, v.size].filter(Boolean).join(" · ") || "-",
        String(v.stock), String(v.minStock), money(v.costPrice), money(v.retailPrice), fmtD(v.expiryDate),
      ]),
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: LINE, textColor: DARK },
    headStyles: { fillColor: GOLD, textColor: DARK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 250, 245] },
    columnStyles: { 0: { cellWidth: 18 }, 3: { halign: "right", fontStyle: "bold" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { cellWidth: 18 } },
    didParseCell: (data) => {
      const row = data.row.raw as string[] | undefined;
      if (data.section === "body" && row) {
        const stock = parseInt(row[3]);
        const min = parseInt(row[4]);
        const exp = row[7];
        if (!isNaN(stock) && !isNaN(min) && stock <= min) data.cell.styles.textColor = RED;
        if (exp && exp !== "-" && (new Date(exp.split("/").reverse().join("-")).getTime() - Date.now()) / 86400000 <= 90)
          data.cell.styles.textColor = RED;
      }
    },
    margin: { left: 14, right: 14 },
  });

  finishDoc(ctx, `stock-cic-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// =============== 4. DESPESAS ===============
export type PdfExpense = { category: string; description: string | null; amount: number; date: string; userName?: string };

export async function expensesReportPdf(opts: {
  store: PdfStore; expenses: PdfExpense[]; fromLabel: string; toLabel: string; generatedBy: string;
}) {
  const { store, expenses, fromLabel, toLabel, generatedBy } = opts;
  await loadLogo();
  const ctx = await buildCtx(store, "Relatório de Despesas", `${fromLabel} a ${toLabel}`, generatedBy);
  const { doc } = ctx;
  let y = 40;
  y = stampLine(ctx, y);

  const total = expenses.reduce((a, e) => a + e.amount, 0);
  const byCat = new Map<string, number>();
  for (const e of expenses) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);

  y = summaryBoxes(ctx, y, [
    { label: "Saídas registadas", value: String(expenses.length) },
    { label: "Total do período", value: money(total), color: RED },
    { label: "Média por saída", value: money(expenses.length ? total / expenses.length : 0) },
    { label: "Categorias", value: String(byCat.size) },
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Data", "Categoria", "Descrição", "Registado por", "Valor"]],
    body: expenses
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((e) => [fmtDT(e.date), e.category, e.description ?? "-", e.userName ?? "-", money(e.amount)]),
    theme: "grid",
    styles: { fontSize: 7.5, cellPadding: 1.6, lineColor: LINE, textColor: DARK },
    headStyles: { fillColor: GOLD, textColor: DARK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 250, 245] },
    columnStyles: { 1: { cellWidth: 38 }, 4: { halign: "right", fontStyle: "bold", textColor: RED } },
    margin: { left: 14, right: 14 },
  });
  y = lastY(doc, y) + 6;

  // Resumo por categoria
  autoTable(doc, {
    startY: y,
    head: [["Categoria", "Total"]],
    body: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, money(v)]),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.8, lineColor: LINE, textColor: DARK },
    headStyles: { fillColor: DARK, textColor: [255, 235, 170], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 250, 245] },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    margin: { left: 14, right: 14 },
  });

  finishDoc(ctx, `despesas-cic-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// =============== 5. LUCRO (v2.7) ===============
export type PdfLucro = {
  receita: number; custo: number; lucroBruto: number; despesas: number;
  lucroLiquido: number; margemPct: number; comissoes: number;
  vendasCount: number; ticketMedio: number; anuladasCount: number; anuladasValor: number;
  creditado: number;
  porProduto: Array<{ nome: string; variante: string; qty: number; receita: number; custo: number; lucro: number; margemPct: number }>;
  porMetodo: Array<{ metodo: string; total: number }>;
  stock: { valorCusto: number; valorRetalho: number; unidades: number };
  previsto?: {
    lucroPotencial: number; vendaPotencial: number; custoTotal: number;
    unidades: number; artigos: number; margemPct: number;
    porProduto: Array<{ nome: string; categoria: string; variante: string; unidades: number; venda: number; custo: number; lucro: number }>;
  };
};

export async function lucroReportPdf(opts: {
  store: PdfStore; lucro: PdfLucro; fromLabel: string; toLabel: string; generatedBy: string;
}) {
  const { store, lucro, fromLabel, toLabel, generatedBy } = opts;
  await loadLogo();
  const ctx = await buildCtx(store, "Relatório de Lucro", `${fromLabel} a ${toLabel}`, generatedBy);
  const { doc } = ctx;
  let y = 40;
  y = stampLine(ctx, y);

  y = summaryBoxes(ctx, y, [
    { label: "Receita (vendas)", value: money(lucro.receita), color: GREEN },
    { label: "Custo mercadoria", value: money(lucro.custo) },
    { label: "Despesas", value: money(lucro.despesas), color: RED },
    { label: "Lucro líquido", value: money(lucro.lucroLiquido), color: lucro.lucroLiquido >= 0 ? GOLD : RED },
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Indicador", "Valor"]],
    body: [
      ["Vendas concluídas no período", String(lucro.vendasCount)],
      ["Ticket médio", money(lucro.ticketMedio)],
      ["Receita total", money(lucro.receita)],
      ["(−) Custo das mercadorias vendidas", money(lucro.custo)],
      ["= Lucro bruto", money(lucro.lucroBruto)],
      ["Margem bruta", `${lucro.margemPct.toFixed(1)}%`],
      ["(−) Despesas da loja no período", money(lucro.despesas)],
      ["= Lucro líquido", money(lucro.lucroLiquido)],
      ["Comissões dos vendedores (já incluídas nas despesas? não - informativo)", money(lucro.comissoes)],
      ["Vendas a fiação no período (receita ainda por receber)", money(lucro.creditado)],
      ["Vendas anuladas", `${lucro.anuladasCount} (${money(lucro.anuladasValor)})`],
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.8, lineColor: LINE, textColor: DARK },
    headStyles: { fillColor: GOLD, textColor: DARK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 250, 245] },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    didParseCell: (data) => {
      const row = data.row.raw as string[] | undefined;
      if (data.section === "body" && row && (row[0].startsWith("=") || row[0].startsWith("(−)"))) {
        data.cell.styles.fontStyle = "bold";
        if (row[0].startsWith("=")) data.cell.styles.fillColor = GOLD_LIGHT;
      }
    },
    margin: { left: 14, right: 14 },
  });
  y = lastY(doc, y) + 6;

  // Pagamentos por método
  if (lucro.porMetodo.length) {
    autoTable(doc, {
      startY: y,
      head: [["Recebido por forma de pagamento", "Total"]],
      body: lucro.porMetodo.map((m) => [METHOD_LABELS[m.metodo] ?? m.metodo, money(m.total)]),
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.8, lineColor: LINE, textColor: DARK },
      headStyles: { fillColor: DARK, textColor: [255, 235, 170], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [252, 250, 245] },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
      margin: { left: 14, right: 14 },
    });
    y = lastY(doc, y) + 6;
  }

  // Produtos mais rentáveis
  autoTable(doc, {
    startY: y,
    head: [["Produto", "Variante", "Qtd", "Receita", "Custo", "Lucro", "Margem"]],
    body: lucro.porProduto
      .slice(0, 300)
      .map((p) => [
        p.nome,
        p.variante || "-",
        String(p.qty),
        money(p.receita), money(p.custo), money(p.lucro),
        `${p.margemPct.toFixed(1)}%`,
      ]),
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: LINE, textColor: DARK },
    headStyles: { fillColor: GOLD, textColor: DARK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 250, 245] },
    columnStyles: {
      0: { cellWidth: 52 }, 1: { cellWidth: 24 }, 2: { halign: "right", cellWidth: 10 },
      3: { halign: "right" }, 4: { halign: "right" },
      5: { halign: "right", fontStyle: "bold", textColor: GREEN }, 6: { halign: "right", cellWidth: 15 },
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        const row = data.row.raw as string[] | undefined;
        if (row && parseFloat((row[5] ?? "").replace(/[^\d.-]/g, "")) < 0)
          data.cell.styles.textColor = RED;
      }
    },
    margin: { left: 14, right: 14 },
  });
  y = lastY(doc, y) + 6;

  // Stock actual (contexto)
  autoTable(doc, {
    startY: y,
    head: [["Stock actual (informativo)", "Valor"]],
    body: [
      ["Unidades em loja", String(lucro.stock.unidades)],
      ["Valor do stock a custo", money(lucro.stock.valorCusto)],
      ["Valor do stock a retalho", money(lucro.stock.valorRetalho)],
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.8, lineColor: LINE, textColor: DARK },
    headStyles: { fillColor: DARK, textColor: [255, 235, 170], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 250, 245] },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    margin: { left: 14, right: 14 },
  });
  y = lastY(doc, y) + 6;

  // v2.8: PREVISÃO de lucro (pedido da Cleyde) - se vender todo o stock actual
  if (lucro.previsto) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text("PREVISÃO DE LUCRO - SE VENDER TODO O STOCK ACTUAL", 14, y);
    y += 4;
    y = summaryBoxes(ctx, y, [
      { label: "Unidades", value: String(lucro.previsto.unidades) },
      { label: "Venda potencial", value: money(lucro.previsto.vendaPotencial) },
      { label: "Custo da mercadoria", value: money(lucro.previsto.custoTotal) },
      { label: "LUCRO PREVISTO", value: money(lucro.previsto.lucroPotencial), color: GREEN },
    ]);
    if (lucro.previsto.porProduto.length) {
      autoTable(doc, {
        startY: y,
        head: [["Produto", "Variante", "Unid.", "Venda", "Lucro previsto"]],
        body: lucro.previsto.porProduto.slice(0, 200).map((p) => [
          p.nome,
          p.variante || "-",
          String(p.unidades),
          money(p.venda),
          money(p.lucro),
        ]),
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 1.5, lineColor: LINE, textColor: DARK },
        headStyles: { fillColor: GOLD, textColor: DARK, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [252, 250, 245] },
        columnStyles: {
          0: { cellWidth: 62 }, 1: { cellWidth: 28 }, 2: { halign: "right", cellWidth: 12 },
          3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold", textColor: GREEN },
        },
        didParseCell: (data) => {
          if (data.section === "body") {
            const row = data.row.raw as string[] | undefined;
            if (row && parseFloat((row[4] ?? "").replace(/[^\d.-]/g, "")) < 0)
              data.cell.styles.textColor = RED;
          }
        },
        margin: { left: 14, right: 14 },
      });
      y = lastY(doc, y) + 3;
    }
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(
      "Estimativa aos preços e custos actuais - não prevê quebras, descontos, promoções nem vendas fiado.",
      14, y
    );
  }

  finishDoc(ctx, `lucro-cic-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// =============== 6. FOLHA SALARIAL ===============
export type PdfPayroll = {
  month: string;
  rows: Array<{ name: string; role: string; baseSalary: number; salesTotal: number; commissions: number; vales: number; toPay: number }>;
};

export async function payrollReportPdf(opts: { store: PdfStore; payroll: PdfPayroll; generatedBy: string }) {
  const { store, payroll, generatedBy } = opts;
  await loadLogo();
  const [yy, mm] = payroll.month.split("-");
  const monthName = new Date(Number(yy), Number(mm) - 1, 1).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  const ctx = await buildCtx(store, "Folha Salarial", monthName.charAt(0).toUpperCase() + monthName.slice(1), generatedBy);
  const { doc } = ctx;
  let y = 40;
  y = stampLine(ctx, y);

  const sum = (f: (r: PdfPayroll["rows"][number]) => number) => payroll.rows.reduce((a, r) => a + f(r), 0);

  y = summaryBoxes(ctx, y, [
    { label: "Funcionários", value: String(payroll.rows.length) },
    { label: "Salários base", value: money(sum((r) => r.baseSalary)) },
    { label: "Comissões", value: money(sum((r) => r.commissions)), color: GREEN },
    { label: "Total a pagar", value: money(sum((r) => r.toPay)), color: GOLD },
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Funcionário", "Nível", "Salário base", "Vendas do mês", "Comissões", "Vales", "A pagar"]],
    body: payroll.rows.map((r) => [
      r.name, r.role === "GERENTE" ? "Gerente" : "Caixa", money(r.baseSalary),
      money(r.salesTotal), money(r.commissions), money(r.vales), money(r.toPay),
    ]),
    foot: [["TOTAL", "", money(sum((r) => r.baseSalary)), money(sum((r) => r.salesTotal)), money(sum((r) => r.commissions)), money(sum((r) => r.vales)), money(sum((r) => r.toPay))]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 1.8, lineColor: LINE, textColor: DARK },
    headStyles: { fillColor: GOLD, textColor: DARK, fontStyle: "bold" },
    footStyles: { fillColor: DARK, textColor: [255, 235, 170], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 250, 245] },
    columnStyles: {
      2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", textColor: GREEN },
      5: { halign: "right", textColor: RED }, 6: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: 14, right: 14 },
  });

  finishDoc(ctx, `folha-cic-${payroll.month}.pdf`);
}
