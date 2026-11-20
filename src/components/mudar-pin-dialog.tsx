"use client";

// ============================================================
// v3.0: MUDAR A MINHA PIN (pedido do dono após o incidente da
// senha de manutenção - a conta do proprietário é blindada na RH
// de propósito, mas o dono precisava de poder trocar a própria
// PIN dentro do sistema). Passo a passo com a barra segmentada
// e o olho da v2.9: PIN actual → nova PIN → confirmar.
// ============================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { fetchT } from "@/lib/http";
import { PinBar, PinKeypad } from "@/components/pin-input";
import { Loader2, KeyRound, CheckCircle2 } from "lucide-react";

const MAX = 6;

export function MudarPinDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const { toast } = useToast();
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1); // 1=actual 2=nova 3=confirmar
  const [actual, setActual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [okFeito, setOkFeito] = useState(false);

  const reset = () => {
    setEtapa(1); setActual(""); setNova(""); setConfirma(""); setErro(false); setBusy(false); setOkFeito(false);
  };

  const fechar = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const digitar = (d: string) => {
    if (busy) return;
    setErro(false);
    const setter = etapa === 1 ? setActual : etapa === 2 ? setNova : setConfirma;
    const val = etapa === 1 ? actual : etapa === 2 ? nova : confirma;
    if (val.length >= MAX) return;
    setter(val + d);
  };

  const apagar = () => {
    if (busy) return;
    const setter = etapa === 1 ? setActual : etapa === 2 ? setNova : setConfirma;
    const val = etapa === 1 ? actual : etapa === 2 ? nova : confirma;
    setter(val.slice(0, -1));
    setErro(false);
  };

  const confirmarEtapa = async () => {
    const val = etapa === 1 ? actual : etapa === 2 ? nova : confirma;
    if (val.length < 4) { setErro(true); return; }
    if (etapa === 1) { setEtapa(2); return; }
    if (etapa === 2) {
      if (nova === actual) { setErro(true); toast({ title: "A nova PIN tem de ser diferente da actual", variant: "destructive" }); return; }
      setEtapa(3); return;
    }
    // etapa 3 - guardar
    if (confirma !== nova) {
      setErro(true);
      toast({ title: "A confirmação não coincide com a nova PIN", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetchT("/api/conta/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinActual: actual, novoPin: nova }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(true);
        if (res.status === 401) throw new Error(data.error ?? "Sessão expirada");
        throw new Error(data.error ?? "Não foi possível alterar a PIN");
      }
      setOkFeito(true);
      toast({ title: "PIN alterada com sucesso", description: "Use a nova PIN da próxima vez que entrar." });
      onDone?.();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao alterar a PIN", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const titulo = etapa === 1 ? "1/3 · PIN actual" : etapa === 2 ? "2/3 · Nova PIN" : "3/3 · Confirmar a nova PIN";
  const valor = etapa === 1 ? actual : etapa === 2 ? nova : confirma;

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="w-4 h-4 text-gold" /> Mudar a minha PIN
          </DialogTitle>
          <DialogDescription>
            Só quem sabe a PIN actual pode trocá-la. Fica válida para o próximo início de sessão.
          </DialogDescription>
        </DialogHeader>

        {okFeito ? (
          <div className="py-4 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
            <p className="text-sm font-medium">A sua PIN foi alterada.</p>
            <Button className="w-full btn-gold" onClick={() => fechar(false)}>Pronto</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground text-center">{titulo}</p>
            <PinBar value={valor} error={erro} />
            <PinKeypad onDigito={digitar} onApagar={apagar} disabled={busy} />
            <div className="flex gap-2">
              {etapa > 1 && (
                <Button variant="outline" className="flex-1" onClick={() => setEtapa((etapa - 1) as 1 | 2)} disabled={busy}>
                  Voltar
                </Button>
              )}
              <Button className="btn-gold flex-1" onClick={confirmarEtapa} disabled={busy || valor.length < 4}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : etapa === 3 ? "Guardar" : "Seguinte"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
