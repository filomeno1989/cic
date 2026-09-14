"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck } from "lucide-react";

export function ManagerPinDialog({
  open, onOpenChange, onSuccess, title, description,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: (pin: string) => void;
  title: string;
  description: string;
}) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    if (!pin) return;
    setLoading(true);
    setError("");
    try {
      // Valida o PIN de gerente SEM criar sessão para o gerente:
      // o caixa continua com a SUA sessão activa.
      const res = await fetch("/api/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "PIN inválido.");
        setPin("");
        return;
      }
      onSuccess(pin);
      setPin("");
      onOpenChange(false);
    } catch {
      setError("Erro de ligação. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setPin(""); setError(""); onOpenChange(v); }}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-gold" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          inputMode="numeric"
          autoFocus
          placeholder="PIN do gerente"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirm()}
          className="text-center text-lg tracking-[0.4em]"
        />
        {error && <p className="text-xs text-destructive text-center">{error}</p>}
        <Button className="btn-gold w-full" onClick={confirm} disabled={loading || !pin}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
