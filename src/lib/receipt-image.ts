// ============================================================
// Recibo como IMAGEM (PNG) - gera no dispositivo via Canvas e
// envia por WhatsApp usando a partilha nativa (Web Share API).
// Se o aparelho não suportar partilha de ficheiros, descarrega
// o PNG e abre o WhatsApp para anexar manualmente.
// Funciona 100% offline.
// ============================================================
"use client";

import { fmtDateTime, mt, methodLabel, waLink } from "@/lib/format";
import type { SaleFlat } from "@/lib/types";
import type { StoreInfo } from "@/components/receipt";

const GOLD = "#b8860b";
const GOLD_LIGHT = "#faf3dd";
const GOLD_LINE = "#d4af37";
const INK = "#161616";
const MUTED = "#6b6b6b";
const DASH = "#c9c2b4";

function loadLogo(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = setTimeout(() => resolve(null), 2000);
    img.onload = () => { clearTimeout(done); resolve(img); };
    img.onerror = () => { clearTimeout(done); resolve(null); };
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function dashedLine(ctx: CanvasRenderingContext2D, y: number, x1: number, x2: number) {
  ctx.save();
  ctx.strokeStyle = DASH;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Gera o PNG do recibo (2x para nitidez no WhatsApp). */
export async function receiptImageBlob(sale: SaleFlat, store: StoreInfo): Promise<Blob> {
  const S = 2; // escala (nitidez)
  const W = 380; // largura lógica
  const M = 22; // margem
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado neste aparelho");

  const logo = await loadLogo("/logo-cic-small.png");

  // ---- 1ª passagem: desenhar num canvas alto, medir a altura final ----
  canvas.width = W * S;
  canvas.height = 2400 * S;
  ctx.scale(S, S);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, 2400);
  ctx.textBaseline = "alphabetic";

  let y = M + 6;

  // Logo
  if (logo) {
    const h = 54;
    const w = Math.min(150, (logo.width / logo.height) * h);
    ctx.drawImage(logo, (W - w) / 2, y, w, h);
    y += h + 6;
  }

  // Cabeçalho
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "bold 21px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
  for (const l of wrapText(ctx, store.storeName, W - M * 2)) {
    ctx.fillText(l, W / 2, y + 14);
    y += 20;
  }
  ctx.font = "12px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
  ctx.fillStyle = MUTED;
  if (store.address) { ctx.fillText(store.address, W / 2, y + 13); y += 16; }
  if (store.phone) { ctx.fillText(`Tel: ${store.phone}`, W / 2, y + 13); y += 16; }
  if (store.nuit) { ctx.fillText(`NUIT: ${store.nuit}`, W / 2, y + 13); y += 16; }

  // Linha dourada
  y += 8;
  ctx.strokeStyle = GOLD_LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M, y);
  ctx.lineTo(W - M, y);
  ctx.stroke();
  y += 16;

  // Metadados
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "bold 14px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
  ctx.fillText(`Recibo #${String(sale.number).padStart(5, "0")}`, M, y + 11);
  y += 20;
  ctx.font = "12.5px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
  ctx.fillStyle = MUTED;
  ctx.fillText(`Data: ${fmtDateTime(sale.clientCreatedAt ?? sale.createdAt)}`, M, y + 11); y += 17;
  ctx.fillText(`Atendido por: ${sale.user?.name ?? "-"}`, M, y + 11); y += 17;
  if (sale.customer?.name) { ctx.fillText(`Cliente: ${sale.customer.name}`, M, y + 11); y += 17; }
  y += 10;
  dashedLine(ctx, y, M, W - M);
  y += 16;

  // Itens
  for (const i of sale.items) {
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = "bold 13px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
    const nameLines = wrapText(ctx, `${i.qty}x ${i.name}`, W - M * 2 - 74);
    let itemTop = y;
    for (const [idx, l] of nameLines.entries()) {
      ctx.fillText(l, M, y + 12);
      y += 17;
      if (idx === 0) {
        ctx.textAlign = "right";
        ctx.font = "13px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
        ctx.fillText(mt(i.total), W - M, itemTop + 12);
        ctx.textAlign = "left";
      }
    }
    if (i.variantLabel) {
      ctx.fillStyle = MUTED;
      ctx.font = "11.5px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
      ctx.fillText(i.variantLabel, M + 10, y + 11);
      y += 15;
    }
    ctx.fillStyle = MUTED;
    ctx.font = "11.5px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
    ctx.fillText(`${mt(i.unitPrice)} / un.`, M + 10, y + 11);
    y += 16;
    y += 4;
  }
  y += 6;
  dashedLine(ctx, y, M, W - M);
  y += 16;

  // Subtotal / desconto
  ctx.textAlign = "right";
  if (sale.discount > 0) {
    ctx.fillStyle = MUTED;
    ctx.font = "12.5px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
    ctx.fillText(`Subtotal: ${mt(sale.subtotal)}`, W - M, y + 10); y += 17;
    ctx.fillText(`Desconto: -${mt(sale.discount)}`, W - M, y + 10); y += 17;
  }

  // Caixa TOTAL
  ctx.font = "bold 17px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
  const boxH = 34;
  ctx.fillStyle = GOLD_LIGHT;
  ctx.strokeStyle = GOLD_LINE;
  ctx.lineWidth = 1.5;
  roundRect(ctx, M, y, W - M * 2, boxH, 8);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = GOLD;
  ctx.fillText("TOTAL", M + 12, y + 23);
  ctx.textAlign = "right";
  ctx.fillStyle = INK;
  ctx.font = "bold 17px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
  ctx.fillText(mt(sale.total), W - M - 12, y + 23);
  y += boxH + 16;

  dashedLine(ctx, y, M, W - M);
  y += 16;

  // Pagamentos
  ctx.textAlign = "left";
  for (const p of sale.payments) {
    ctx.fillStyle = INK;
    ctx.font = "12.5px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
    let l = `${methodLabel(p.method)}: ${mt(p.amount)}`;
    if (p.method === "DINHEIRO" && p.change > 0) l += `  (troco: ${mt(p.change)})`;
    ctx.fillText(l, M, y + 11); y += 17;
    if (p.reference) {
      ctx.fillStyle = MUTED;
      ctx.font = "11px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
      ctx.fillText(`Ref: ${p.reference}`, M + 10, y + 11); y += 15;
    }
  }

  if (sale.isCredit) {
    y += 8;
    ctx.fillStyle = "#fdecea";
    ctx.strokeStyle = "#e53935";
    ctx.lineWidth = 1.4;
    roundRect(ctx, M, y, W - M * 2, 26, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#c62828";
    ctx.font = "bold 12px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("VENDA A CRÉDITO (FIAÇÃO)", W / 2, y + 17);
    y += 34;
  }
  y += 12;
  dashedLine(ctx, y, M, W - M);
  y += 18;

  // Rodapé
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "italic 12.5px 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
  for (const l of wrapText(ctx, store.receiptFooter || "Obrigado pela preferência!", W - M * 2)) {
    ctx.fillText(l, W / 2, y + 11);
    y += 16;
  }

  const contentH = Math.ceil((y + M) * S);

  // ---- 2ª passagem: recortar na altura certa ----
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = contentH;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Canvas não suportado neste aparelho");
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(canvas, 0, 0, out.width, contentH, 0, 0, out.width, contentH);

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png", 0.92));
  if (!blob) throw new Error("Falha ao gerar a imagem do recibo");
  return blob;
}

export type ShareReceiptResult = "shared" | "downloaded" | "cancelled";

/**
 * Partilha o recibo em PNG: tenta a partilha nativa do aparelho
 * (Android/iOS: o utilizador escolhe o WhatsApp), senão descarrega
 * o PNG e abre o WhatsApp para anexar a imagem.
 */
export async function shareOrDownloadReceipt(sale: SaleFlat, store: StoreInfo): Promise<ShareReceiptResult> {
  const blob = await receiptImageBlob(sale, store);
  const filename = `recibo-${String(sale.number).padStart(5, "0")}.png`;
  const file = new File([blob], filename, { type: "image/png" });

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof navigator.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Recibo #${String(sale.number).padStart(5, "0")}`,
        text: `${store.storeName} - recibo da sua compra`,
      });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // falhou a partilha → segue para descarregar
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  const wa = waLink(
    sale.customer?.phone,
    `Olá${sale.customer?.name ? ` ${sale.customer.name}` : ""}! Segue em anexo a imagem do recibo da sua compra na ${store.storeName}. Obrigado pela preferência!`
  );
  window.open(wa ?? "https://wa.me/", "_blank");
  return "downloaded";
}
