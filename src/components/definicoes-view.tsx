"use client";

import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, Save, Printer, DatabaseBackup, Upload, Download, AlertTriangle, CheckCircle2, Trash2,
  QrCode, Copy, Send, ExternalLink, Store, Wrench, CalendarClock, MessageCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { mt, mensagemCobranca } from "@/lib/format";
import type { StoreInfo } from "@/components/receipt";
import type { SessionUser } from "@/lib/types";
import { mostraHora, MSG_PADRAO_MANUTENCAO } from "@/lib/hora-manutencao";

// ============================================================
// v3.0 (M2): BACKUP AUTOMÁTICO DIÁRIO - lista + criar agora + descarregar.
// O sistema cria sozinho 1 snapshot por dia (na 1ª sessão de gerente do dia);
// este cartão mostra o que existe e permite descarregar/restaurar pelo
// fluxo normal. Mantém os últimos 7.
// ============================================================
type BackupAutoSnap = { id: string; data: string; tamanho: number; comFotos: boolean; criadoEm: string };

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
  // v3.0 (M2): backups automáticos
  const [autoSnaps, setAutoSnaps] = useState<BackupAutoSnap[] | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{ name: string; payload: unknown; meta: { exportedAt?: string; counts?: Record<string, number> } } | null>(null);
  // v2.6 (D6): por omissão o restauro PRESERVA contas de funcionários e
  // definições da loja - substituir é opt-in (checkbox no diálogo).
  const [restaurarContas, setRestaurarContas] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // P2: Portal do cliente /loja - QR + link com mensagem bonita
  const [waMsg, setWaMsg] = useState("Bem-vindo(a) ao nosso catálogo online! ✨ Veja as novidades:");
  const [portalLink, setPortalLink] = useState("");
  const [qrData, setQrData] = useState<string | null>(null);

  // v3.2 (F4): MODO DE MANUTENÇÃO - fechar o sistema ao pessoal já ou agendar
  const [manut, setManut] = useState<{ modo: string; mensagem: string; inicio: string; fim: string }>({ modo: "", mensagem: "", inicio: "", fim: "" });
  const [manutMsg, setManutMsg] = useState(""); // mensagem personalizada (partilhada pelos 2 modos)
  const [previsao, setPrevisao] = useState(""); // AGORA: previsão de retorno opcional
  const [agInicio, setAgInicio] = useState(""); // AGENDADA: começo
  const [agFim, setAgFim] = useState(""); // AGENDADA: fim
  const [manutBusy, setManutBusy] = useState(false);
  const [manutConfirm, setManutConfirm] = useState(false); // diálogo antes de fechar já

  // Limpeza total da base de dados
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetPin, setResetPin] = useState("");
  const [resetting, setResetting] = useState(false);
  const lastBackup = typeof window !== "undefined" ? localStorage.getItem(LAST_BACKUP_KEY) : null;
  const lastBackupDate = lastBackup ? new Date(lastBackup) : null;
  const daysSince = lastBackupDate ? Math.floor((Date.now() - lastBackupDate.getTime()) / 86400000) : null;

  // P2: link do portal = origem actual + /loja + a mensagem do utilizador (com acentos!)
  useEffect(() => {
    setPortalLink(`${window.location.origin}/loja?msg=${encodeURIComponent(waMsg)}`);
  }, [waMsg]);

  // v3.2 (F4): carregar o estado do modo de manutenção (só gerente)
  const loadManut = async () => {
    try {
      const res = await fetch("/api/manutencao-modo");
      if (!res.ok) return;
      const d = await res.json();
      setManut(d);
      setManutMsg(d.mensagem ?? "");
      setPrevisao(d.modo === "AGORA" ? d.fim ?? "" : "");
      setAgInicio(d.modo === "AGENDADA" ? d.inicio ?? "" : "");
      setAgFim(d.modo === "AGENDADA" ? d.fim ?? "" : "");
    } catch { /* offline */ }
  };
  useEffect(() => { if (isManager) loadManut(); }, [isManager]);

  // v3.2 (F4): guardar um modo ("" = desligar | AGORA | AGENDADA)
  const guardarManut = async (modo: string, horarios?: { inicio?: string; fim?: string }) => {
    setManutBusy(true);
    try {
      const res = await fetch("/api/manutencao-modo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo, mensagem: manutMsg, inicio: horarios?.inicio ?? agInicio, fim: horarios?.fim ?? previsao }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erro ao guardar");
      setManut((m) => ({ ...m, modo, mensagem: manutMsg, inicio: horarios?.inicio ?? (modo === "AGENDADA" ? agInicio : modo === "AGORA" ? new Date().toISOString().slice(0, 16) : ""), fim: horarios?.fim ?? (modo === "AGORA" ? previsao : modo === "AGENDADA" ? agFim : "") }));
      toast({
        title: modo === "" ? "Manutenção desligada - sistema aberto" : modo === "AGORA" ? "Sistema fechado para manutenção" : "Manutenção agendada",
        description: modo === "" ? "O pessoal já pode entrar e trabalhar." : modo === "AGORA" ? "O pessoal vê a mensagem e não consegue entrar; o dono entra pelo «Acesso por código»." : "O pessoal vê o aviso até à hora de início; dentro do período o sistema bloqueia e reabre sozinho no fim.",
      });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setManutBusy(false);
    }
  };

  // v3.0 (M2): carregar a lista de snapshots automáticos (só gerente)
  const loadAuto = async () => {
    try {
      const res = await fetch("/api/backup/auto");
      if (res.ok) setAutoSnaps((await res.json()).snaps ?? []);
    } catch { /* offline */ }
  };
  useEffect(() => {
    if (isManager) void loadAuto();
  }, [isManager]);

  const criarAutoAgora = async () => {
    setAutoBusy(true);
    try {
      const res = await fetch("/api/backup/auto", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erro");
      toast({ title: data.jaExiste ? "O backup de hoje já estava guardado" : "Backup automático de hoje criado", description: `Snapshot ${data.snapshot?.data} · ${(Math.round((data.snapshot?.tamanho ?? 0) / 1024)).toLocaleString("pt-PT")} KB` });
      void loadAuto();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro no backup automático", variant: "destructive" });
    } finally {
      setAutoBusy(false);
    }
  };

  const descarregarAuto = async (snap: BackupAutoSnap) => {
    try {
      const res = await fetch(`/api/backup/auto?id=${snap.id}`);
      if (!res.ok) throw new Error("Não foi possível descarregar");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-automatico-${snap.data}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast({ title: "Backup descarregado", description: `Snapshot de ${snap.data} - pode restaurá-lo em «Restaurar de Ficheiro».` });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao descarregar", variant: "destructive" });
    }
  };

  // P2: QR gerado no navegador (sem rede) a partir do link
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!portalLink) return;
      try {
        const QR = (await import("qrcode")).default;
        const url = await QR.toDataURL(portalLink, { width: 420, margin: 2, color: { dark: "#0a0a0a", light: "#ffffff" } });
        if (alive) setQrData(url);
      } catch { if (alive) setQrData(null); }
    })();
    return () => { alive = false; };
  }, [portalLink]);

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(portalLink);
      toast({ title: "Link copiado", description: "Cole na conversa do cliente." });
    } catch {
      toast({ title: "Não foi possível copiar - copie manualmente:", description: portalLink, variant: "destructive" });
    }
  };

  const partilharWhatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${waMsg}\n${portalLink}`)}`, "_blank");
  };

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

  const exportBackup = async (semFotos = false) => {
    setExporting(true);
    try {
      const res = await fetch(`/api/backup${semFotos ? "?semFotos=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const now = new Date();
      const pad = (x: number) => String(x).padStart(2, "0");
      a.href = url;
      a.download = `backup-cic${semFotos ? "-sem-fotos" : ""}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
      a.click();
      URL.revokeObjectURL(url);
      localStorage.setItem(LAST_BACKUP_KEY, now.toISOString());
      toast({
        title: "Backup descarregado",
        description: `Guarda este ficheiro em local seguro (WhatsApp, e-mail ou pen). ${data.meta?.counts ? `${data.meta.counts.vendas} vendas, ${data.meta.counts.produtos} produtos${semFotos ? " (sem fotos)" : ""}.` : ""}`,
      });
      setTimeout(() => window.location.reload(), 800); // refresca "último backup"
    } catch (e) {
      // v2.6 (D5): backup grande demais (413) - tenta de novo sem fotos
      const msg = e instanceof Error ? e.message : "Erro no backup";
      if (!semFotos && msg.includes("fotos")) {
        toast({ title: "Backup grande - a tentar SEM fotos", description: "As fotos não cabem no ficheiro. Vai exportar os dados sem elas.", variant: "destructive" });
        setExporting(false);
        return exportBackup(true);
      }
      toast({ title: msg, variant: "destructive" });
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
        body: JSON.stringify({ backup: pendingRestore.payload, incluirContas: restaurarContas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      toast({ title: "Backup restaurado", description: data.message });
      setPendingRestore(null);
      setRestaurarContas(false);
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
          <div><Label className="text-xs">NUIT <span className="text-muted-foreground font-normal">(sai no recibo)</span></Label><Input value={form.nuit ?? ""} inputMode="numeric" maxLength={9} disabled={!isManager} onChange={(e) => setForm({ ...form, nuit: e.target.value.replace(/\D/g, "") })} placeholder="Ex: 142369567" /></div>
          <div className="col-span-2"><Label className="text-xs">Endereço</Label><Input value={form.address} disabled={!isManager} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
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

      {/* ---------- v3.4: Mensagem de cobrança (fiação) editável ---------- */}
      <div className="card-lux p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center"><MessageCircle className="w-4.5 h-4.5 text-gold" /></span>
          <div>
            <h3 className="font-bold text-sm">Mensagem de cobrança (fiação)</h3>
            <p className="text-xs text-muted-foreground">O texto enviado no WhatsApp ao cobrar um cliente devedor, no ecrã «Clientes». Altere quando quiser - sem precisar de mexer no sistema.</p>
          </div>
        </div>

        {isManager ? (
          <>
            <div>
              <Label className="text-xs">Texto da mensagem <span className="text-muted-foreground font-normal">- vazio = usa o texto padrão</span></Label>
              <Textarea rows={9} value={form.cobrancaMsg ?? ""} disabled={!isManager} onChange={(e) => setForm({ ...form, cobrancaMsg: e.target.value.slice(0, 2000) })} placeholder="Vazio = texto padrão do sistema (já termina com as formas de pagamento)" className="text-sm" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground mr-1">Variáveis (toque para inserir no fim):</span>
              {([
                ["{nome}", "Nome do cliente"],
                ["{loja}", "Nome da loja"],
                ["{valor}", "Saldo devido (ex.: 1.250,00 MT)"],
                ["{quando}", "Desde quando - já vem com parênteses, ex.: (compra de há 3 dias)"],
              ] as const).map(([tag, desc]) => (
                <button
                  key={tag}
                  type="button"
                  title={desc}
                  disabled={!form.cobrancaMsg?.trim()}
                  onClick={() => setForm({ ...form, cobrancaMsg: ((form.cobrancaMsg ?? "") + " " + tag).trim() })}
                  className="text-[11px] rounded-md border border-border px-2 py-0.5 transition-colors hover:border-gold/60 hover:bg-accent/40 disabled:opacity-40 disabled:pointer-events-none"
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[11px] font-semibold mb-1.5 text-muted-foreground">Pré-visualização (exemplo)</p>
              <p className="text-xs whitespace-pre-line leading-relaxed">
                {mensagemCobranca({
                  template: form.cobrancaMsg,
                  nome: "Ana Silva",
                  loja: form.storeName || "CIC Fragrâncias & Glamour",
                  valor: mt(1250),
                  quando: " (compra de há 3 dias)",
                })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={saving} onClick={() => { setForm({ ...form, cobrancaMsg: "" }); toast({ title: "Texto padrão restaurado", description: "Clique em Guardar para aplicar." }); }}>
                Restaurar texto padrão
              </Button>
              <Button className="btn-gold flex-1" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Guardar</>}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Apenas o gerente pode alterar esta mensagem.</p>
        )}
      </div>

      {/* ---------- P2: Portal do Cliente (só gerente) ---------- */}
      <div className="card-lux p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center"><QrCode className="w-4.5 h-4.5 text-gold" /></span>
          <div>
            <h3 className="font-bold text-sm">Portal do Cliente · /loja</h3>
            <p className="text-xs text-muted-foreground">Catálogo online com fotos e preços - o cliente encomenda pelo WhatsApp da loja.</p>
          </div>
        </div>

        {isManager ? (
          <>
            <div>
              <Label className="text-xs">WhatsApp que recebe as encomendas <span className="text-muted-foreground font-normal">- só números</span></Label>
              <Input value={form.whatsappLoja ?? ""} inputMode="tel" onChange={(e) => setForm({ ...form, whatsappLoja: e.target.value.replace(/[^+\d]/g, "") })} placeholder="Ex: 841234567 ou 258841234567" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Instagram <span className="text-muted-foreground font-normal">(link completo)</span></Label>
                <Input value={form.instagramUrl ?? ""} onChange={(e) => setForm({ ...form, instagramUrl: e.target.value.trim() })} placeholder="https://instagram.com/..." />
              </div>
              <div>
                <Label className="text-xs">Facebook <span className="text-muted-foreground font-normal">(link completo)</span></Label>
                <Input value={form.facebookUrl ?? ""} onChange={(e) => setForm({ ...form, facebookUrl: e.target.value.trim() })} placeholder="https://facebook.com/..." />
              </div>
              <div>
                <Label className="text-xs">TikTok <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input value={form.tiktokUrl ?? ""} onChange={(e) => setForm({ ...form, tiktokUrl: e.target.value.trim() })} placeholder="https://tiktok.com/@..." />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Os links que preencher aparecem como botões «Siga-nos» no rodapé do portal do cliente.</p>
            <div>
              <Label className="text-xs">Mensagem bonita para enviar aos clientes <span className="text-muted-foreground font-normal">- aparece no topo do portal (em vez de códigos aleatórios)</span></Label>
              <Textarea rows={2} value={waMsg} onChange={(e) => setWaMsg(e.target.value)} placeholder="Ex: Bem-vinda ao nosso catálogo! Novidades toda a semana ✨" />
            </div>
            <div className="rounded-lg border p-3 space-y-2.5">
              <p className="text-[11px] text-muted-foreground break-all"><b>Link do portal:</b> {portalLink || "…"}</p>
              <div className="flex items-center gap-3">
                {qrData ? (
                  <img src={qrData} alt="QR Code do portal" className="w-28 h-28 rounded-lg border bg-white p-1 shrink-0" />
                ) : (
                  <div className="w-28 h-28 rounded-lg border bg-muted animate-pulse shrink-0" />
                )}
                <div className="flex-1 grid grid-cols-1 gap-1.5">
                  <Button size="sm" variant="outline" onClick={copiarLink}><Copy className="w-3.5 h-3.5 mr-1" /> Copiar link</Button>
                  <Button size="sm" variant="outline" onClick={partilharWhatsapp}><Send className="w-3.5 h-3.5 mr-1" /> Enviar por WhatsApp</Button>
                  <Button size="sm" variant="outline" onClick={() => window.open("/loja", "_blank")}><ExternalLink className="w-3.5 h-3.5 mr-1" /> Abrir portal</Button>
                  {qrData && (
                    <a href={qrData} download="portal-cic-qr.png" className="block">
                      <Button size="sm" variant="outline" className="w-full"><Download className="w-3.5 h-3.5 mr-1" /> Descarregar QR</Button>
                    </a>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Dois modos de partilha: <b>por QR</b> (imprima e cole no balcão - o cliente aponta a câmara) e <b>por link</b> (a mensagem bonita viaja no link e aparece no portal do cliente).
              </p>
            </div>
            <Button className="btn-gold w-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Store className="w-4 h-4 mr-1" /> Guardar Portal (WhatsApp + redes sociais)</>}
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Apenas o gerente configura o portal do cliente.</p>
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
              <Button variant="outline" onClick={() => exportBackup()} disabled={exporting || restoring}>
                {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />} Descarregar Backup
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={exporting || restoring}>
                {restoring ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />} Restaurar de Ficheiro
              </Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Guardar o ficheiro .json no WhatsApp, e-mail ou Google Drive. <b>Restaurar substitui os dados actuais</b> pelos do ficheiro (contas e definições são preservadas, salvo escolha no diálogo) - use apenas se necessário (ex: telefone novo).
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Apenas o gerente pode fazer e restaurar backups.</p>
        )}
      </div>

      {/* ---------- v3.0 (M2): Backup automático diário (só gerente) ---------- */}
      {isManager && (
        <div className="card-lux p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center"><CheckCircle2 className="w-4.5 h-4.5 text-green-600" /></span>
            <div>
              <h3 className="font-bold text-sm">Backup automático (diário)</h3>
              <p className="text-xs text-muted-foreground">O sistema guarda sozinho 1 cópia por dia (mantém as últimas 7) - protege de restauros maus e apagamentos acidentais.</p>
            </div>
          </div>
          {autoSnaps === null ? (
            <p className="text-xs text-muted-foreground">A procurar snapshots…</p>
          ) : autoSnaps.length === 0 ? (
            <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">Ainda não há snapshots automáticos - o primeiro é criado na próxima vez que entrar como gerente, ou toque em «Fazer agora».</p>
          ) : (
            <div className="space-y-1.5">
              {autoSnaps.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm bg-muted/40 rounded-lg px-3 py-2">
                  <span className="font-medium">{s.data.split("-").reverse().join("/")}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.comFotos ? "com fotos" : "sem fotos"} · {(s.tamanho / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <span className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => descarregarAuto(s)}>
                      <Download className="w-3 h-3 mr-1" /> Descarregar
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => fileRef.current?.click()} disabled={restoring}>
                      <Upload className="w-3 h-3 mr-1" /> Restaurar
                    </Button>
                  </span>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">«Restaurar» abre o diálogo normal de restauro - escolha o ficheiro descarregado do dia que quiser repor.</p>
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={criarAutoAgora} disabled={autoBusy}>
            {autoBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <DatabaseBackup className="w-4 h-4 mr-1 text-gold" />} Fazer backup de hoje agora
          </Button>
        </div>
      )}

      <div className="card-lux p-5 space-y-2">
        <h3 className="font-bold text-sm">Como ligar a impressora térmica</h3>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
          <li>Ligue a impressora (58mm ou 80mm) por <b>Bluetooth</b> ou <b>USB</b> ao seu telefone/PC.</li>
          <li>Em Android: emparelhe nas Definições → Bluetooth → Impressora.</li>
          <li>No sistema, abra o recibo da venda e toque em <b>Imprimir</b> → escolha a impressora térmica.</li>
          <li>Se o navegador pedir, permita o diálogo de impressão e escolha o formato correspondente ({form.thermalWidth}mm).</li>
        </ol>
      </div>

      {/* ---------- v3.2 (F4): Modo de Manutenção (só gerente) ---------- */}
      {isManager && (
        <div className="card-lux p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-lg bg-gold/10 flex items-center justify-center"><Wrench className="w-4.5 h-4.5 text-gold" /></span>
            <div>
              <h3 className="font-bold text-sm">Modo de Manutenção</h3>
              <p className="text-xs text-muted-foreground">Fecha o sistema ao pessoal: ao entrarem, veem a mensagem e não conseguem trabalhar.</p>
            </div>
          </div>

          {/* Estado actual */}
          {manut.modo === "AGORA" && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <p className="text-xs font-bold text-amber-500 flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5" /> EM MANUTENÇÃO AGORA</p>
              <p className="text-xs text-muted-foreground">O pessoal não consegue entrar nem usar o sistema. Você entra pelo «Acesso por código» no ecrã de entrada, como sempre.</p>
              <Button variant="outline" className="h-8 text-xs" onClick={() => guardarManut("")} disabled={manutBusy}>
                {manutBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-green-500" />} Terminar manutenção agora
              </Button>
            </div>
          )}
          {manut.modo === "AGENDADA" && manut.inicio && manut.fim && (
            <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 space-y-2">
              <p className="text-xs font-bold text-gold flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> AGENDADA: de {mostraHora(manut.inicio)} a {mostraHora(manut.fim)}</p>
              <p className="text-xs text-muted-foreground">O pessoal vê o aviso já; dentro do período o sistema bloqueia e REABRE SOZINHO no fim - não precisa de voltar para desligar.</p>
              <Button variant="outline" className="h-8 text-xs" onClick={() => guardarManut("")} disabled={manutBusy}>
                {manutBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null} Cancelar agendamento
              </Button>
            </div>
          )}

          {/* Mensagem personalizada */}
          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem que o pessoal vê (opcional)</Label>
            <Textarea
              rows={2}
              value={manutMsg}
              onChange={(e) => setManutMsg(e.target.value)}
              placeholder={MSG_PADRAO_MANUTENCAO}
              maxLength={300}
            />
          </div>

          {/* Fechar agora */}
          <div className="space-y-1.5">
            <Label className="text-xs">Fechar agora · previsão de retorno (opcional)</Label>
            <Input type="datetime-local" value={previsao} onChange={(e) => setPrevisao(e.target.value)} className="h-9 text-xs" />
            <Button className="w-full h-9 text-xs" onClick={() => setManutConfirm(true)} disabled={manutBusy || manut.modo === "AGORA"}>
              <Wrench className="w-3.5 h-3.5 mr-1" /> Entrar em manutenção agora
            </Button>
          </div>

          {/* Agendar */}
          <div className="space-y-1.5">
            <Label className="text-xs">Agendar: o sistema fica offline das X às Y</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input type="datetime-local" value={agInicio} onChange={(e) => setAgInicio(e.target.value)} className="h-9 text-xs" aria-label="Início da manutenção" />
              <Input type="datetime-local" value={agFim} onChange={(e) => setAgFim(e.target.value)} className="h-9 text-xs" aria-label="Fim da manutenção" />
            </div>
            <Button variant="outline" className="w-full h-9 text-xs" onClick={() => guardarManut("AGENDADA", { inicio: agInicio, fim: agFim })} disabled={manutBusy || !agInicio || !agFim}>
              <CalendarClock className="w-3.5 h-3.5 mr-1" /> Agendar manutenção
            </Button>
          </div>
        </div>
      )}

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
                <p>Isto vai <b>APAGAR todos os dados actuais</b> (vendas, stock, clientes, fiação) e substituir pelos do ficheiro:</p>
                <p className="font-mono text-xs bg-muted rounded p-2 break-all">{pendingRestore?.name}</p>
                {pendingRestore?.meta?.exportedAt && (
                  <p className="text-xs">Backup feito em {new Date(pendingRestore.meta.exportedAt).toLocaleString("pt-PT")}{pendingRestore.meta.counts ? ` · ${pendingRestore.meta.counts.vendas ?? 0} vendas · ${pendingRestore.meta.counts.clientes ?? 0} clientes` : ""}.</p>
                )}
                <p className="text-xs"><b>Por omissão, as contas de funcionários (PINs) e as definições da loja são PRESERVADAS</b> - apenas são recriadas contas do backup que já não existam (sem acesso, só histórico).</p>
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-2">
                  <Checkbox id="restaurarContas" checked={restaurarContas} onCheckedChange={(v) => setRestaurarContas(v === true)} className="mt-0.5" />
                  <Label htmlFor="restaurarContas" className="text-xs font-normal cursor-pointer">
                    Substituir TAMBÉM as contas de funcionários e as definições da loja pelos do backup (os PINs actuais serão trocados e a sua sessão pode fechar).
                  </Label>
                </div>
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

      {/* v3.2 (F4): confirmação antes de fechar o sistema já */}
      <Dialog open={manutConfirm} onOpenChange={(v) => { if (!v && !manutBusy) setManutConfirm(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wrench className="w-5 h-5 text-gold" /> Fechar o sistema agora?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>O pessoal <b>não consegue entrar nem trabalhar</b> até terminar a manutenção - veem a mensagem logo ao abrir o sistema.</p>
                {previsao && <p className="text-xs">Previsão de retorno mostrada: <b>{mostraHora(previsao)}</b> (o sistema NÃO reabre sozinho - só quando terminar aqui).</p>}
                {!previsao && <p className="text-xs">Sem previsão de retorno definida - o pessoal vê só a mensagem de aguarde.</p>}
                <p className="text-xs text-muted-foreground">Você continua a entrar pelo «Acesso por código» e pode desligar aqui a qualquer momento.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setManutConfirm(false)} disabled={manutBusy}>Cancelar</Button>
            <Button
              className="btn-gold"
              onClick={async () => { setManutConfirm(false); await guardarManut("AGORA", { fim: previsao }); }}
              disabled={manutBusy}
            >
              {manutBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Wrench className="w-4 h-4 mr-1" />} Fechar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
