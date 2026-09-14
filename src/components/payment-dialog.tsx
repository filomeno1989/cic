"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mt, PAYMENT_METHODS } from "@/lib/format";
import { Banknote, CreditCard, Smartphone, HandCoins, Loader2, AlertTriangle } from "lucide-react";

export type PayLine = { method: string; amount: number; change?: number; reference?: string };

const methodIcon = (m: string, cls = "w-4 h-4") => {
  switch (m) {
    case "DINHEIRO": return <Banknote className={cls} />;
    case "POS": return <CreditCard className={cls} />;
    case "CREDITO": return <HandCoins className={cls} />;
    default: return <Smartphone className={cls} />;
  }
};

export function PaymentDialog({
  open, onOpenChange, total, priceType, hasCustomer, customerBalance, customerLimit,
  canCredit, onConfirm, submitting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  priceType: "RETALHO" | "GROSSO";
  hasCustomer: boolean;
  customerBalance: number;
  customerLimit: number;
  canCredit: boolean;
  onConfirm: (lines: PayLine[], cashReceived: number) => void;
  submitting: boolean;
}) {
  const [lines, setLines] = useState<PayLine[]>([]);
  const [method, setMethod] = useState<string>("DINHEIRO");
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");
  // Nota: o componente é remontado via `key` no pai a cada abertura - estado começa limpo.

  const paid = lines.reduce((a, l) => a + l.amount, 0);
  const remaining = Math.max(0, total - paid);
  const cashReceivedNum = parseFloat(received) || 0;
  const cashLine = lines.find((l) => l.method === "DINHEIRO");
  const change = cashReceivedNum > 0 && cashLine ? Math.max(0, cashReceivedNum - cashLine.amount) : 0;
  const creditInLines = lines.filter((l) => l.method === "CREDITO").reduce((a, l) => a + l.amount, 0);
  const creditExceeded = customerLimit > 0 && customerBalance + creditInLines > customerLimit;

  const addLine = () => {
    const value = parseFloat(amount) || remaining;
    if (value <= 0) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.method === method);
      if (existing) {
        return prev.map((l) => (l.method === method ? { ...l, amount: l.amount + value, reference: reference || l.reference } : l));
      }
      return [...prev, { method, amount: value, reference: reference || undefined }];
    });
    setAmount("");
    setReference("");
  };

  const removeLine = (m: string) => setLines((prev) => prev.filter((l) => l.method !== m));

  const quickButtons = useMemo(
    () => [total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500].filter((v, i, arr) => arr.indexOf(v) === i),
    [total]
  );

  const reset = () => {
    setLines([]);
    setAmount("");
    setReceived("");
    setReference("");
  };

  const canFinish = lines.length > 0 && paid >= total - 0.01 && !creditExceeded && !(lines.some((l) => l.method === "CREDITO") && !hasCustomer);

  // Confirma a venda anexando o TROCO à linha de dinheiro.
  // Sem isto o troco nunca chegava à BD: o recibo não mostrava "(troco: …)"
  // e o fecho de caixa contava o dinheiro errado (esperado alto → "sobra" falsa).
  const confirm = () => {
    const finalLines: PayLine[] = lines.map((l) => {
      if (l.method !== "DINHEIRO") return l;
      const c = cashReceivedNum > 0 ? Math.max(0, cashReceivedNum - l.amount) : 0;
      return { ...l, change: Math.round(c * 100) / 100 };
    });
    onConfirm(finalLines, cashReceivedNum);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagamento · {mt(total)} {priceType === "GROSSO" && <span className="text-xs text-gold">(Preço Grosso)</span>}</DialogTitle>
        </DialogHeader>

        {/* Botões rápidos de método */}
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => {
            const disabled = m.value === "CREDITO" && !canCredit;
            return (
              <button
                key={m.value}
                disabled={disabled}
                onClick={() => setMethod(m.value)}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-xs font-medium transition-all min-h-[64px] justify-center ${
                  method === m.value
                    ? "border-gold bg-accent text-accent-foreground"
                    : "border-border hover:border-gold/50 disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {methodIcon(m.value, "w-5 h-5")}
                <span>{m.label}</span>
                <span className="text-[10px] text-muted-foreground leading-none">{m.hint}</span>
              </button>
            );
          })}
        </div>

        {method === "CREDITO" && !hasCustomer && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Fiação exige cliente registado - selecione o cliente na venda.
          </div>
        )}
        {method === "CREDITO" && hasCustomer && creditExceeded && (
          <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-500/10 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Excede o limite de fiação do cliente (saldo {mt(customerBalance)} + crédito {mt(creditInLines)} &gt; limite {mt(customerLimit)}).
          </div>
        )}

        <div className="space-y-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label className="text-xs">{PAYMENT_METHODS.find((m) => m.value === method)?.label} - valor</Label>
              <Input
                type="number" inputMode="decimal" placeholder={remaining.toFixed(2)}
                value={amount} onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <Button onClick={addLine} className="btn-gold h-10">Adicionar</Button>
          </div>

          {method === "DINHEIRO" && (
            <div>
              <Label className="text-xs">Notas recebidas (cálculo do troco)</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {quickButtons.map((v) => (
                  <Button key={v} variant="secondary" size="sm" className="h-8 rounded-full text-xs" onClick={() => setReceived(String(v))}>
                    {v} MT
                  </Button>
                ))}
              </div>
              <Input type="number" inputMode="decimal" placeholder="Valor recebido em notas…" value={received} onChange={(e) => setReceived(e.target.value)} />
              {change > 0 && (
                <p className="text-sm font-semibold text-gold mt-1.5">
                  Troco a devolver: {mt(change)}
                </p>
              )}
            </div>
          )}

          {["MPESA", "EMOLA", "MKESH", "POS"].includes(method) && (
            <div>
              <Label className="text-xs">Referência da transação (opcional)</Label>
              <Input placeholder="Ex: PP240914.1234.A56789" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          )}
        </div>

        {/* Linhas de pagamento */}
        {lines.length > 0 && (
          <div className="space-y-1.5">
            {lines.map((l) => (
              <div key={l.method} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2 text-sm">
                <span className="flex items-center gap-2">{methodIcon(l.method)} {PAYMENT_METHODS.find((m) => m.value === l.method)?.label}</span>
                <span className="flex items-center gap-2 font-semibold">
                  {mt(l.amount)}
                  <button onClick={() => removeLine(l.method)} className="text-destructive hover:underline text-xs">remover</button>
                </span>
              </div>
            ))}
            <div className="flex justify-between text-sm px-3">
              <span className="text-muted-foreground">Pago / Total:</span>
              <span className={paid >= total - 0.01 ? "text-green-600 font-semibold" : "text-amber-600 font-semibold"}>
                {mt(paid)} / {mt(total)}
              </span>
            </div>
            {paid > total + 0.01 && (
              <p className="text-xs text-muted-foreground px-3">
                Troco total a devolver: {mt(paid - total)}
              </p>
            )}
          </div>
        )}

        <Button
          className="btn-gold w-full h-12 text-base"
          disabled={!canFinish || submitting}
          onClick={confirm}
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : `Finalizar Venda · ${mt(total)}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
