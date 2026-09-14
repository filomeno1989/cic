"use client";

import { useState } from "react";
import { fmtDateTime, mt, methodLabel, waLink } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle, Printer, Copy, ImagePlus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { shareOrDownloadReceipt } from "@/lib/receipt-image";
import type { SaleFlat } from "@/lib/types";

export type StoreInfo = {
  storeName: string; phone: string; address: string; receiptFooter: string; thermalWidth: string; nuit?: string;
};

export function buildReceiptText(sale: SaleFlat, store: StoreInfo): string {
  const lines: string[] = [];
  lines.push(`*${store.storeName}*`);
  if (store.address) lines.push(store.address);
  if (store.phone) lines.push(`Tel: ${store.phone}`);
  lines.push("--------------------------------");
  lines.push(`Recibo: #${String(sale.number).padStart(5, "0")}`);
  lines.push(`Data: ${fmtDateTime(sale.clientCreatedAt ?? sale.createdAt)}`);
  lines.push(`Atendido por: ${sale.user?.name ?? "-"}`);
  if (sale.customer?.name) lines.push(`Cliente: ${sale.customer.name}`);
  lines.push("--------------------------------");
  for (const i of sale.items) {
    lines.push(`${i.qty}x ${i.name}`);
    if (i.variantLabel) lines.push(`   (${i.variantLabel})`);
    lines.push(`   ${mt(i.unitPrice)}  =  ${mt(i.total)}`);
  }
  lines.push("--------------------------------");
  if (sale.discount > 0) {
    lines.push(`Subtotal: ${mt(sale.subtotal)}`);
    lines.push(`Desconto: -${mt(sale.discount)}`);
  }
  lines.push(`*TOTAL: ${mt(sale.total)}*`);
  lines.push("--------------------------------");
  for (const p of sale.payments) {
    let l = `${methodLabel(p.method)}: ${mt(p.amount)}`;
    if (p.method === "DINHEIRO" && p.change > 0) l += ` (troco: ${mt(p.change)})`;
    if (p.reference) l += ` [${p.reference}]`;
    lines.push(l);
  }
  if (sale.isCredit) lines.push(`⚠ Venda a crédito (fiação)`);
  lines.push("");
  lines.push(store.receiptFooter);
  return lines.join("\n");
}

export function ReceiptDialog({
  sale,
  store,
  open,
  onOpenChange,
}: {
  sale: SaleFlat | null;
  store: StoreInfo;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [imgBusy, setImgBusy] = useState(false);
  if (!sale) return null;

  const is58 = store.thermalWidth === "58";
  const waText = buildReceiptText(sale, store);
  const wa = waLink(sale.customer?.phone, waText);

  const shareImage = async () => {
    setImgBusy(true);
    try {
      const result = await shareOrDownloadReceipt(sale, store);
      if (result === "shared") {
        toast({ title: "Imagem pronta para enviar", description: "Escolha o WhatsApp e o contacto na tela de partilha." });
      } else if (result === "downloaded") {
        toast({ title: "Imagem do recibo descarregada", description: "Anexe a imagem na conversa do WhatsApp que abrimos." });
      }
    } catch {
      toast({ title: "Não foi possível gerar a imagem", description: "Tente novamente ou use o envio por texto.", variant: "destructive" });
    } finally {
      setImgBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Recibo #{String(sale.number).padStart(5, "0")}
            {sale.offline && <span className="text-xs text-amber-600">(vendido offline)</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Pré-visualização do recibo térmico */}
        <div className="flex justify-center py-2 bg-neutral-200 dark:bg-neutral-900 rounded-lg p-3">
          <div
            id="thermal-receipt"
            className={`receipt-paper p-3 ${is58 ? "receipt-58" : ""}`}
            style={{ width: is58 ? "58mm" : "80mm", maxWidth: "100%" }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: "bold", fontSize: "1.15em" }}>{store.storeName}</div>
              {store.address && <div>{store.address}</div>}
              {store.phone && <div>Tel: {store.phone}</div>}
            </div>
            <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
            <div>Recibo: #{String(sale.number).padStart(5, "0")}</div>
            <div>Data: {fmtDateTime(sale.clientCreatedAt ?? sale.createdAt)}</div>
            <div>Atendido: {sale.user?.name ?? "-"}</div>
            {sale.customer?.name && <div>Cliente: {sale.customer.name}</div>}
            <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
            {sale.items.map((i) => (
              <div key={i.id} style={{ marginBottom: 2 }}>
                <div>{i.qty}x {i.name}</div>
                {i.variantLabel && <div style={{ paddingLeft: 8, fontSize: "0.9em" }}>({i.variantLabel})</div>}
                <div style={{ paddingLeft: 8 }}>{mt(i.unitPrice)} = {mt(i.total)}</div>
              </div>
            ))}
            <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
            {sale.discount > 0 && (
              <>
                <div>Subtotal: {mt(sale.subtotal)}</div>
                <div>Desconto: -{mt(sale.discount)}</div>
              </>
            )}
            <div style={{ fontWeight: "bold", fontSize: "1.1em" }}>TOTAL: {mt(sale.total)}</div>
            <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
            {sale.payments.map((p) => (
              <div key={p.id}>
                {methodLabel(p.method)}: {mt(p.amount)}
                {p.method === "DINHEIRO" && p.change > 0 ? ` (troco: ${mt(p.change)})` : ""}
                {p.reference ? ` [${p.reference}]` : ""}
              </div>
            ))}
            {sale.isCredit && <div style={{ fontWeight: "bold" }}>** Venda a crédito (fiação) **</div>}
            <div style={{ textAlign: "center", marginTop: 6 }}>{store.receiptFooter}</div>
          </div>
        </div>

        <div className="space-y-2">
          <Button
            className="w-full h-11 bg-green-600 hover:bg-green-700 text-white rounded-lg"
            onClick={shareImage}
            disabled={imgBusy}
          >
            {imgBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-1" />}
            Enviar por WhatsApp como Imagem
          </Button>
          <div className="grid grid-cols-3 gap-2">
            <Button className="btn-gold rounded-lg" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1" /> Imprimir
            </Button>
            <Button
              variant="outline"
              disabled={!wa}
              onClick={() => {
                if (wa) window.open(wa, "_blank");
              }}
            >
              <MessageCircle className="w-4 h-4 mr-1 text-green-600" /> Texto
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(waText);
                toast({ title: "Recibo copiado", description: "Texto do recibo na área de transferência" });
              }}
            >
              <Copy className="w-4 h-4 mr-1" /> Copiar
            </Button>
          </div>
        </div>
        {!sale.customer?.phone && (
          <p className="text-xs text-muted-foreground text-center">
            Dica: registe o WhatsApp do cliente para enviar recibos diretamente.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
