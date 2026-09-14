"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mt, fmtDate, fmtDateTime, waLink, methodLabel, PAYMENT_METHODS } from "@/lib/format";
import type { CustomerFlat, SessionUser } from "@/lib/types";
import { Search, UserPlus, Phone, HandCoins, History, Loader2, Wallet, MessageCircle, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CustomerDetail = CustomerFlat & {
  notes: string | null;
  sales: Array<{ id: string; number: number; total: number; status: string; isCredit: boolean; priceType: string; createdAt: string; seller: string; items: Array<{ name: string; variantLabel: string | null; qty: number; total: number }> }>;
  payments: Array<{ id: string; amount: number; method: string; note: string | null; date: string }>;
};

export function ClientesView({ user, onClientsChanged }: { user: SessionUser; onClientsChanged: () => void }) {
  const { toast } = useToast();
  const [clients, setClients] = useState<CustomerFlat[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Novo/editar cliente
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerFlat | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", creditLimit: "", notes: "" });
  const [saving, setSaving] = useState(false);

  // Detalhe
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Amortização - usa estado próprio para NUNCA sobrescrever o detalhe (causa de crash)
  const [amortTarget, setAmortTarget] = useState<CustomerFlat | null>(null);
  const [amortOpen, setAmortOpen] = useState(false);
  const [amortForm, setAmortForm] = useState({ amount: "", method: "DINHEIRO", note: "" });
  const [amortSaving, setAmortSaving] = useState(false);

  // Gestão (gerente): arquivados
  const isManager = user.role === "GERENTE";
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers${showArchived ? "?archived=1" : ""}`);
      if (res.ok) setClients(await res.json());
    } catch { /* offline */ } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q));
  }, [clients, search]);

  const debtors = filtered.filter((c) => c.balance > 0.009);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", phone: "", creditLimit: "", notes: "" });
    setFormOpen(true);
  };

  const openEdit = (c: CustomerFlat) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone ?? "", creditLimit: String(c.creditLimit), notes: c.notes ?? "" });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = editing
        ? await fetch(`/api/customers/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
        : await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error();
      toast({ title: editing ? "Cliente atualizado" : "Cliente registado" });
      setFormOpen(false);
      load();
      onClientsChanged();
    } catch {
      toast({ title: "Erro ao guardar cliente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (c: CustomerFlat) => {
    try {
      const res = await fetch(`/api/customers/${c.id}`);
      if (!res.ok) throw new Error();
      const data: CustomerDetail = await res.json();
      setDetail(data);
      setDetailOpen(true);
    } catch {
      toast({ title: "Erro ao carregar histórico", variant: "destructive" });
    }
  };

  const openAmort = (c: CustomerFlat) => {
    setAmortTarget(c);
    setAmortForm({ amount: "", method: "DINHEIRO", note: "" });
    setAmortOpen(true);
  };

  const amortize = async () => {
    if (!amortTarget) return;
    const amount = parseFloat(amortForm.amount);
    if (!amount || amount <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    setAmortSaving(true);
    try {
      const res = await fetch(`/api/customers/${amortTarget.id}/amortize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...amortForm, amount, userId: user.id }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Amortização registada", description: `${mt(amount)} - fiação de ${amortTarget.name} reduzida.` });
      setAmortOpen(false);
      load();
      onClientsChanged();
      if (detailOpen && detail?.id === amortTarget.id) openDetail(amortTarget);
    } catch {
      toast({ title: "Erro ao registar amortização", variant: "destructive" });
    } finally {
      setAmortSaving(false);
    }
  };

  // ---- Gestão: arquivar / restaurar / eliminar (só gerente) ----
  const setArchived = async (c: CustomerFlat, active: boolean) => {
    try {
      const res = await fetch(`/api/customers/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error);
      toast({ title: active ? "Cliente restaurado" : "Cliente arquivado", description: c.name });
      load();
      onClientsChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    }
  };

  const removeCustomer = async (c: CustomerFlat) => {
    if (!confirm(`Eliminar definitivamente «${c.name}»?\n\nSó é possível se o cliente NUNCA teve compras nem amortizações. Caso contrário, use «Arquivar».`)) return;
    try {
      const res = await fetch(`/api/customers/${c.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Cliente eliminado", description: c.name });
      load();
      onClientsChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao eliminar", variant: "destructive" });
    }
  };

  const cobrancaMsg = (c: CustomerFlat) =>
    waLink(
      c.phone,
      `Olá ${c.name}! 😊\nAqui é da *CIC Fragrâncias & Glamour*.\n\nPassando só para lembrar com carinho que consta um saldo de *${mt(c.balance)}* na sua conta de fiação.\n\nQuando puder, apareça na loja ou Combine connosco o pagamento. Obrigado pela preferência! ✨`
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Procurar cliente por nome ou telefone…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {isManager && (
          <Button variant={showArchived ? "secondary" : "outline"} className={showArchived ? "h-10" : "h-10 text-muted-foreground"} onClick={() => setShowArchived((v) => !v)}>
            <Archive className="w-4 h-4 mr-1" /> {showArchived ? "A ver arquivados" : "Ver arquivados"}
          </Button>
        )}
        <Button className="btn-gold" onClick={openNew}>
          <UserPlus className="w-4 h-4 mr-1" /> Novo Cliente
        </Button>
      </div>

      {debtors.length > 0 && (
        <div className="card-lux p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-amber-600" /> Clientes Devedores - total {mt(debtors.reduce((a, c) => a + c.balance, 0))}
          </h3>
          <div className="space-y-2">
            {debtors.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm bg-amber-500/8 rounded-lg px-3 py-2">
                <span>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground text-xs ml-2">{c.phone}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge className="bg-amber-500 hover:bg-amber-500 text-white">{mt(c.balance)}</Badge>
                  {waLink(c.phone, "") && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { const link = cobrancaMsg(c); if (link) window.open(link, "_blank"); }}>
                      <MessageCircle className="w-3 h-3 mr-1 text-green-600" /> Cobrar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAmort(c)}>
                    <HandCoins className="w-3 h-3 mr-1" /> Receber
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((c) => (
          <div key={c.id} className={`card-lux p-4 space-y-2 ${c.active === false ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <button className="text-left min-w-0" onClick={() => openDetail(c)}>
                <p className="font-semibold truncate hover:text-gold">{c.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> {c.phone ?? "sem contacto"}
                </p>
              </button>
              {c.active === false ? (
                <Badge variant="outline" className="shrink-0 text-muted-foreground">arquivado</Badge>
              ) : c.balance > 0.009 ? (
                <Badge className="bg-amber-500 hover:bg-amber-500 text-white shrink-0">deve {mt(c.balance)}</Badge>
              ) : c.balance < -0.009 ? (
                <Badge variant="outline" className="text-green-600 border-green-600/40 shrink-0">crédito {mt(-c.balance)}</Badge>
              ) : (
                <Badge variant="outline" className="shrink-0">sem dívida</Badge>
              )}
            </div>
            {c.active !== false && c.creditLimit > 0 && (
              <div>
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                  <span>Limite fiação: {mt(c.creditLimit)}</span>
                  <span>{c.balance > 0 ? `${Math.round((c.balance / c.creditLimit) * 100)}% usado` : "disponível"}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-gold rounded-full" style={{ width: `${Math.min(100, Math.max(0, (c.balance / c.creditLimit) * 100))}%` }} />
                </div>
              </div>
            )}
            <div className="flex gap-1.5 pt-1">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => openDetail(c)} disabled={c.active === false}>
                <History className="w-3 h-3 mr-1" /> Histórico
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => openEdit(c)}>Editar</Button>
              {c.active !== false && c.balance > 0.009 && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openAmort(c)}>
                  <HandCoins className="w-3 h-3" />
                </Button>
              )}
              {isManager && (
                <>
                  {c.active === false ? (
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Restaurar cliente" onClick={() => setArchived(c, true)}>
                      <ArchiveRestore className="w-3.5 h-3.5 text-green-600" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Arquivar cliente (só gerente)" onClick={() => setArchived(c, false)}>
                      <Archive className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-destructive hover:text-destructive" title="Eliminar definitivamente (só gerente)" onClick={() => removeCustomer(c)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-12 text-sm">Nenhum cliente encontrado.</div>
        )}
      </div>

      {/* Form cliente */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Editar Cliente" : "Novo Cliente"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" /></div>
            <div><Label className="text-xs">WhatsApp</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+258 84 000 0000" /></div>
            <div><Label className="text-xs">Limite de fiação (MT)</Label><Input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} placeholder="2000" /></div>
            <div><Label className="text-xs">Notas (tom preferido, alergias…)</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ex: usa Tom 220, prefere perfume doce" /></div>
            <Button className="btn-gold w-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detalhe do cliente */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {detail.name}
                  {detail.balance > 0.009 && <Badge className="bg-amber-500 hover:bg-amber-500 text-white">deve {mt(detail.balance)}</Badge>}
                </DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">{detail.phone} · limite {mt(detail.creditLimit)}{detail.notes ? ` · ${detail.notes}` : ""}</p>

              <h4 className="text-sm font-semibold flex items-center gap-1.5 mt-2"><History className="w-4 h-4 text-gold" /> Últimas compras</h4>
              <div className="space-y-2">
                {(detail.sales ?? []).slice(0, 12).map((s) => (
                  <div key={s.id} className={`rounded-lg px-3 py-2 text-sm border ${s.status === "ANULADA" ? "opacity-50 border-destructive/30" : "border-border"}`}>
                    <div className="flex justify-between items-center">
                      <span className="font-medium">#{String(s.number).padStart(5, "0")} <span className="text-xs text-muted-foreground">· {fmtDateTime(s.createdAt)} · {s.seller}</span></span>
                      <span className="font-bold">{mt(s.total)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.items.map((i) => `${i.qty}x ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""}`).join(", ")}
                      {s.isCredit && <span className="text-amber-600 font-medium ml-1">· fiação</span>}
                      {s.status === "ANULADA" && <span className="text-destructive font-medium ml-1">· ANULADA</span>}
                    </p>
                  </div>
                ))}
                {(detail.sales ?? []).length === 0 && <p className="text-xs text-muted-foreground">Ainda sem compras.</p>}
              </div>

              <h4 className="text-sm font-semibold mt-2">Amortizações</h4>
              <div className="space-y-1">
                {(detail.payments ?? []).slice(0, 8).map((p) => (
                  <div key={p.id} className="flex justify-between text-sm px-3 py-1.5 bg-green-500/8 rounded-lg">
                    <span className="text-xs text-muted-foreground">{fmtDate(p.date)} · {methodLabel(p.method)}{p.note ? ` · ${p.note}` : ""}</span>
                    <span className="text-green-600 font-semibold">-{mt(p.amount)}</span>
                  </div>
                ))}
                {(detail.payments ?? []).length === 0 && <p className="text-xs text-muted-foreground">Sem amortizações.</p>}
              </div>

              {detail.balance > 0.009 && (
                <Button className="btn-gold w-full" onClick={() => { setDetailOpen(false); openAmort(detail); }}>
                  <HandCoins className="w-4 h-4 mr-1" /> Receber Pagamento da Fiação
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Amortização */}
      <Dialog open={amortOpen} onOpenChange={setAmortOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Receber de {amortTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {amortTarget && amortTarget.balance > 0 && (
              <p className="text-sm text-muted-foreground">Saldo devedor atual: <span className="font-bold text-amber-600">{mt(amortTarget.balance)}</span></p>
            )}
            <div>
              <Label className="text-xs">Valor recebido (MT) *</Label>
              <Input type="number" autoFocus value={amortForm.amount} onChange={(e) => setAmortForm({ ...amortForm, amount: e.target.value })} placeholder="500" />
              {amortTarget && amortTarget.balance > 0 && (
                <div className="flex gap-1.5 mt-2">
                  {[0.25, 0.5, 1].map((f) => (
                    <Button key={f} size="sm" variant="secondary" className="h-7 text-xs rounded-full" onClick={() => setAmortForm({ ...amortForm, amount: (Math.round(amortTarget.balance * f * 100) / 100).toFixed(2) })}>
                      {f === 1 ? "Tudo" : `${f * 100}%`} ({mt(Math.round(amortTarget.balance * f * 100) / 100)})
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Forma</Label>
              <Select value={amortForm.method} onValueChange={(v) => setAmortForm({ ...amortForm, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.filter((m) => m.value !== "CREDITO").map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Nota</Label><Input value={amortForm.note} onChange={(e) => setAmortForm({ ...amortForm, note: e.target.value })} placeholder="Ex: promete o resto na próxima semana" /></div>
            <Button className="btn-gold w-full" onClick={amortize} disabled={amortSaving}>
              {amortSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Registar Amortização"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
