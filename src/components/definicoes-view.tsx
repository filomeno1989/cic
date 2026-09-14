"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Save, Printer, DatabaseBackup, Upload, Download, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { StoreInfo } from "@/components/receipt";
import type { SessionUser } from "@/lib/types";

const LAST_BACKUP_KEY = "cic_last_backup";

export function DefinicoesView({
  user, store, onSaved,
}: {
  user: SessionUser;
  store: StoreInfo;
  onSaved: (s: StoreInfo) => void;
}) {
  const { toast } = useToast();
  const isManager = user.role === "GERENTE";
  const [form, setForm] = useState<StoreInfo>(store);
  const [saving, setSaving] = useState(false);

  // Backup
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{ name: string; payload: unknown; meta: { exportedAt?: string; counts?: Record<string, number> } } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Limpeza total da base de dados
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetPin, setResetPin] = useState("");
  const [resetting, setResetting] = useState(false);
  const lastBackup = typeof window !== "undefined" ? localStorage.getItem(LAST_BACKUP_KEY) : null;
  const lastBackupDate = lastBackup ? new Date(lastBackup) : null;
  const daysSince = lastBackupDate ? Math.floor((Date.now() - lastBackupDate.getTime()) / 86400000) : null;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro");
      }
      onSaved(form);
      toast({ title: "Definições guardadas" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const exportBackup = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/backup");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date();
      const pad = (x: number) => String(x).padStart(2, "0");
      a.href = url;
      a.download = `backup-cic-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      localStorage.setItem(LAST_BACKUP_KEY, now.toISOString());
      toast({
        title: "Backup descarregado",
        description: `Guarda este ficheiro em local seguro (WhatsApp, e-mail ou pen). ${data.meta?.counts ? `${data.meta.counts.vendas} vendas, ${data.meta.counts.produtos} produtos.` : ""}`,
      });
      setTimeout(() => window.location.reload(), 800); // refresca "último backup"
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro no backup", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const onFilePicked = async (f: File | null) => {
    if (!f) return;
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      const meta = parsed?.meta ?? {};
      setPendingRestore({ name: f.name, payload: parsed, meta });
    } catch {
      toast({ title: "Ficheiro inválido", description: "Não foi possível ler o backup - confirma que é o .json descarregado daqui.", variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const doRestore = async () => {
    if (!pendingRestore) return;
    setRestoring(true);
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup: pendingRestore.payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      toast({ title: "Backup restaurado", description: data.message });
      setPendingRestore(null);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao restaurar", variant: "destructive" });
    } finally {
      setRestoring(false);
    }
  };

  const doReset = async () => {
    setResetting(true);
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: resetPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      // limpa caches locais e sessão para recomeçar limpo
      Object.keys(localStorage).filter((k) => k.startsWith("cic_")).forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
      toast({ title: "Base de dados limpa", description: data.message });
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao limpar", variant: "destructive" });
      setResetting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="card-lux p-5 space-y-4">
        <h3 className="font-bold">Dados da Loja (no recibo)</h3>
        <div><Label className="text-xs">Nome da loja</Label><Input value={form.storeName} disabled={!isManager} onChange={(e) => setForm({ ...form, storeName: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Telefone</Label><Input value={form.phone} disabled={!isManager} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label className="text-xs">Endereço</Label><Input value={form.address} disabled={!isManager} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        </div>
        <div><Label className="text-xs">Mensagem no rodapé do recibo</Label><Input value={form.receiptFooter} disabled={!isManager} onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })} /></div>

        <div>
          <Label className="text-xs mb-2 block">Largura da impressora térmica</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["58", "80"] as const).map((w) => (
              <button
                key={w}
                disabled={!isManager}
                onClick={() => setForm({ ...form, thermalWidth: w })}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-sm font-semibold transition-all ${
                  form.thermalWidth === w ? "border-gold bg-accent text-accent-foreground" : "border-border hover:border-gold/50"
                }`}
              >
                <Printer className="w-4 h-4" />
                {w}mm
                <span className="text-[10px] text-muted-foreground font-normal">{w === "58" ? "Mini talão" : "Talão padrão"}</span>
              </button>
            ))}
          </div>
        </div>

        {isManager ? (
          <Button className="btn-gold w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Guardar Definições</>}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground text-center">Apenas o gerente pode alterar as definições.</p>
        )}
      </div>

      {/* ---------- Backup e Restauração (só gerente) ---------- */}
      <div className="card-lux p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center"><DatabaseBackup className="w-4.5 h-4.5 text-gold" /></span>
          <div>
            <h3 className="font-bold text-sm">Backup dos Dados</h3>
            <p className="text-xs text-muted-foreground">Cópia de segurança de TUDO: vendas, stock, fiação, funcionários e despesas.</p>
          </div>
        </div>

        {isManager ? (
          <>
            <div className={`rounded-lg p-3 text-xs flex items-center gap-2 ${daysSince === null ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : daysSince > 7 ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-700 dark:text-green-400"}`}>
              {daysSince === null ? (
                <><AlertTriangle className="w-4 h-4 shrink-0" /> Ainda nunca foi feito um backup. Faça o primeiro hoje - o telefone pode perder-se ou avariar.</>
              ) : daysSince > 7 ? (
                <><AlertTriangle className="w-4 h-4 shrink-0" /> Último backup foi há {daysSince} dias ({lastBackupDate?.toLocaleDateString("pt-PT")}). Recomenda-se 1× por semana.</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 shrink-0" /> Último backup: {lastBackupDate?.toLocaleDateString("pt-PT")} - em dia.</>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              <Button variant="outline" onClick={exportBackup} disabled={exporting || restoring}>
                {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />} Descarregar Backup
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={exporting || restoring}>
                {restoring ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />} Restaurar de Ficheiro
              </Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Guardar o ficheiro .json no WhatsApp, e-mail ou Google Drive. <b>Restaurar substitui TODOS os dados actuais</b> pelos do ficheiro - use apenas se necessário (ex: telefone novo).
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Apenas o gerente pode fazer e restaurar backups.</p>
        )}
      </div>

      <div className="card-lux p-5 space-y-2">
        <h3 className="font-bold text-sm">Como ligar a impressora térmica</h3>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
          <li>Ligue a impressora (58mm ou 80mm) por <b>Bluetooth</b> ou <b>USB</b> ao seu telefone/PC.</li>
          <li>Em Android: emparelhe nas Definições → Bluetooth → Impressora.</li>
          <li>No sistema, abra o recibo da venda e toque em <b>Imprimir</b> → escolha a impressora térmica.</li>
          <li>Se o navegador pedir, permita o diálogo de impressão e escolha o formato correspondente ({form.thermalWidth}mm).</li>
        </ol>
      </div>

      {/* ---------- Zona de Perigo (só gerente) ---------- */}
      {isManager && (
        <div className="card-lux p-5 space-y-3 border-destructive/40">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center"><Trash2 className="w-4.5 h-4.5 text-destructive" /></span>
            <div>
              <h3 className="font-bold text-sm text-destructive">Limpar Base de Dados</h3>
              <p className="text-xs text-muted-foreground">Apaga TUDO para começar de novo com dados reais.</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Remove produtos, stock, clientes, fiação, vendas, despesas, vales, fechos e funcionários de caixa.
            <b> Mantém</b> o seu utilizador gerente e as definições da loja. A numeração recomeça em #00001.
            Se quiser guardar os dados de teste antes, descarregue o backup acima.
          </p>
          <Button variant="destructive" onClick={() => { setResetText(""); setResetPin(""); setResetOpen(true); }}>
            <Trash2 className="w-4 h-4 mr-1" /> Limpar tudo agora
          </Button>
        </div>
      )}

      {/* Confirmação de limpeza total */}
      <Dialog open={resetOpen} onOpenChange={(v) => { if (!v && !resetting) setResetOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Limpar toda a base de dados?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Esta ação é <b>DEFINITIVA</b>: apaga produtos, clientes, vendas, fiação, despesas, vales e fechos.</p>
                <p className="text-xs">Só se mantêm a sua conta de gerente e as definições da loja. Faça backup antes se ainda precisar dos dados de teste.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Escreva <b>APAGAR</b> para confirmar</Label>
              <Input value={resetText} onChange={(e) => setResetText(e.target.value)} placeholder="APAGAR" />
            </div>
            <div>
              <Label className="text-xs">PIN de gerente</Label>
              <Input type="password" inputMode="numeric" maxLength={6} value={resetPin} onChange={(e) => setResetPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>Cancelar</Button>
            <Button variant="destructive" onClick={doReset} disabled={resetting || resetText !== "APAGAR" || resetPin.length < 4}>
              {resetting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />} Apagar tudo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de restauro */}
      <Dialog open={pendingRestore !== null} onOpenChange={(v) => { if (!v && !restoring) setPendingRestore(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Restaurar backup?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Isto vai <b>APAGAR todos os dados actuais</b> e substituir pelos do ficheiro:</p>
                <p className="font-mono text-xs bg-muted rounded p-2 break-all">{pendingRestore?.name}</p>
                {pendingRestore?.meta?.exportedAt && (
                  <p className="text-xs">Backup feito em {new Date(pendingRestore.meta.exportedAt).toLocaleString("pt-PT")}{pendingRestore.meta.counts ? ` · ${pendingRestore.meta.counts.vendas ?? 0} vendas · ${pendingRestore.meta.counts.clientes ?? 0} clientes` : ""}.</p>
                )}
                <p className="text-destructive text-xs font-semibold">Tudo o que foi registado DEPOIS desse backup será perdido.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingRestore(null)} disabled={restoring}>Cancelar</Button>
            <Button variant="destructive" onClick={doRestore} disabled={restoring}>
              {restoring ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Sim, restaurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
