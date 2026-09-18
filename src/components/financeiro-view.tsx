"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { mt, fmtDateTime, DEFAULT_EXPENSE_CATEGORIES } from "@/lib/format";
import { fetchT } from "@/lib/http";
import type { SessionUser } from "@/lib/types";
import { Receipt, LockKeyhole, Loader2, TrendingDown, CheckCircle2, XCircle, Settings2, Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Expense = { id: string; category: string; description: string | null; amount: number; date: string; user: { name: string } };
type Closing = {
  id: string; closedAt: string; userName: string;
  countedCash: number; countedPos: number; countedMpesa: number;
  countedEmola?: number | null; countedMkesh?: number | null;
  expectedCash?: number; expectedPos?: number; expectedMpesa?: number;
  expectedEmola?: number | null; expectedMkesh?: number | null;
  diffCash?: number; diffPos?: number; diffMpesa?: number;
  diffEmola?: number | null; diffMkesh?: number | null;
  salesTotal?: number; note?: string | null;
};

// Selo compacto de diferença: ✓ certo · verde sobra (+) · vermelho falta (−)
function DifBadge({ d }: { d: number | null | undefined }) {
  if (d === null || d === undefined || Math.abs(d) < 0.009) {
    return <span className="text-[11px] text-muted-foreground">✓ certo</span>;
  }
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${d < 0 ? "text-destructive" : "text-green-600"}`}>
      {d < 0 ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
      {d < 0 ? `-${mt(-d)}` : `+${mt(d)}`}
    </span>
  );
}

export function FinanceiroView({ user, online, onDataChanged }: { user: SessionUser; online: boolean; onDataChanged: () => void }) {
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [closings, setClosings] = useState<Closing[]>([]);
  const [form, setForm] = useState({ category: DEFAULT_EXPENSE_CATEGORIES[0], description: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // trava anti-duplo-clique (mesma cura do stock duplicado)

  // Gestor de despesas fixas (categorias)
  const [categories, setCategories] = useState<string[]>(DEFAULT_EXPENSE_CATEGORIES);
  const [catOpen, setCatOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [catSaving, setCatSaving] = useState(false);
  const catSavingRef = useRef(false);

  // Fecho cego - P2: carteiras separadas (M-Pesa / e-Mola / mKesh),
  // o sistema calcula o esperado de cada uma automaticamente
  const [closeForm, setCloseForm] = useState({ cash: "", pos: "", mpesa: "", emola: "", mkesh: "", note: "" });
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const [closeResult, setCloseResult] = useState<{ closedAt: string; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [eRes, cRes] = await Promise.all([
        fetchT("/api/expenses?limit=60"),
        fetchT("/api/closings"), // papel e userId vêm da sessão no servidor
      ]);
      if (eRes.ok) setExpenses(await eRes.json());
      if (cRes.ok) setClosings(await cRes.json());
    } catch { /* offline */ }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Carrega categorias guardadas (despesas fixas)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchT("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.expenseCategories) && data.expenseCategories.length > 0) {
          setCategories(data.expenseCategories);
          setForm((f) => ({ ...f, category: data.expenseCategories.includes(f.category) ? f.category : data.expenseCategories[0] }));
        }
      } catch { /* usa predefinidas */ }
    })();
  }, []);

  const persistCategories = async (list: string[]) => {
    if (catSavingRef.current) return; // DUPLO-CLIQUE BLOQUEADO
    setCatSaving(true);
    catSavingRef.current = true;
    try {
      const res = await fetchT("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseCategories: list }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro");
      }
      setCategories(list);
      if (!list.includes(form.category)) setForm((f) => ({ ...f, category: list[0] ?? "" }));
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao guardar categorias", variant: "destructive" });
    } finally {
      catSavingRef.current = false;
      setCatSaving(false);
    }
  };

  const addCategory = () => {
    const name = newCat.trim();
    if (!name) return;
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast({ title: "Essa categoria já existe", variant: "destructive" });
      return;
    }
    setNewCat("");
    void persistCategories([...categories, name]);
  };

  const removeCategory = (name: string) => {
    const list = categories.filter((c) => c !== name);
    if (list.length === 0) return;
    void persistCategories(list);
  };

  const addExpense = async () => {
    if (savingRef.current) return; // DUPLO-CLIQUE BLOQUEADO
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    setSaving(true);
    savingRef.current = true;
    try {
      const res = await fetchT("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount, userId: user.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro ao registar despesa");
      }
      toast({ title: "Despesa registada", description: `${form.category} - ${mt(amount)}` });
      setForm({ category: categories.includes(form.category) ? form.category : categories[0], description: "", amount: "" });
      load();
      onDataChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro de rede - verifique a internet e tente de novo", variant: "destructive" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const doClosing = async () => {
    if (closingRef.current) return; // DUPLO-CLIQUE BLOQUEADO - fecho duplicado seria grave
    setClosing(true);
    closingRef.current = true;
    try {
      const res = await fetchT("/api/closings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          countedCash: parseFloat(closeForm.cash) || 0,
          countedPos: parseFloat(closeForm.pos) || 0,
          countedMpesa: parseFloat(closeForm.mpesa) || 0,
          countedEmola: parseFloat(closeForm.emola) || 0,
          countedMkesh: parseFloat(closeForm.mkesh) || 0,
          note: closeForm.note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      // Resposta cega - sem diferenças!
      setCloseResult({ closedAt: data.closedAt, message: data.message });
      setCloseForm({ cash: "", pos: "", mpesa: "", emola: "", mkesh: "", note: "" });
      load();
    } catch (e) {
      if (!online) {
        toast({ title: "Sem ligação ao servidor", description: "O fecho exige ligação - tente quando a rede voltar.", variant: "destructive" });
      } else {
        toast({ title: e instanceof Error ? e.message : "Erro no fecho", variant: "destructive" });
      }
    } finally {
      closingRef.current = false;
      setClosing(false);
    }
  };

  const todayExpenses = expenses.filter((e) => new Date(e.date).toDateString() === new Date().toDateString());
  const totalToday = todayExpenses.reduce((a, e) => a + e.amount, 0);

  return (
    <div className="space-y-4">
      <Tabs defaultValue={user.role === "GERENTE" ? "despesas" : "fecho"}>
        <TabsList>
          {user.role === "GERENTE" && (
            <TabsTrigger value="despesas" className="gap-1.5"><TrendingDown className="w-3.5 h-3.5" /> Despesas</TabsTrigger>
          )}
          <TabsTrigger value="fecho" className="gap-1.5"><LockKeyhole className="w-3.5 h-3.5" /> Fecho de Caixa</TabsTrigger>
          {user.role === "GERENTE" && <TabsTrigger value="historico">Conciliação</TabsTrigger>}
        </TabsList>

        {/* ---------- Despesas ---------- */}
        <TabsContent value="despesas" className="space-y-4">
          <div className="card-lux p-4 space-y-3">
            <h3 className="font-semibold text-sm">Registar saída do caixa</h3>
            <div className="grid sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Categoria (despesa fixa ou variável)</Label>
                  <button type="button" className="text-[11px] text-gold hover:underline flex items-center gap-1 mb-1" onClick={() => setCatOpen(true)}>
                    <Settings2 className="w-3 h-3" /> Gerir despesas fixas
                  </button>
                </div>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Valor (MT) *</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="950" />
              </div>
              <div>
                <Label className="text-xs">Descrição</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: 2 sacos de cimento… não, Credelec 200kWh" />
              </div>
            </div>
            <Button className="btn-gold" onClick={addExpense} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Receipt className="w-4 h-4 mr-1" /> Registar Despesa</>}
            </Button>
          </div>

          <div className="card-lux overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/40">
              <h3 className="font-semibold text-sm">Saídas registadas</h3>
              <Badge variant="secondary">Hoje: {mt(totalToday)}</Badge>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Registado por</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{fmtDateTime(e.date)}</TableCell>
                      <TableCell className="text-sm font-medium">{e.category}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.description ?? "-"}</TableCell>
                      <TableCell className="text-xs">{e.user.name}</TableCell>
                      <TableCell className="text-right text-sm font-semibold text-destructive">-{mt(e.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {expenses.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">Sem despesas registadas.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ---------- Fecho cego ---------- */}
        <TabsContent value="fecho">
          {closeResult ? (
            <div className="card-lux p-8 text-center space-y-4 max-w-md mx-auto fade-up">
              <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto" />
              <h3 className="text-lg font-bold">Fecho registado com sucesso</h3>
              <p className="text-sm text-muted-foreground">{closeResult.message}</p>
              <p className="text-xs text-muted-foreground">{fmtDateTime(closeResult.closedAt)} · Operador: {user.name}</p>
              <p className="text-[11px] text-muted-foreground bg-muted rounded-lg p-3">
                🔒 Conforme a política da casa, o resultado da conciliação (falta/sobra) é visível apenas ao gerente.
              </p>
              <Button variant="outline" onClick={() => setCloseResult(null)}>Novo turno</Button>
            </div>
          ) : (
            <div className="max-w-md mx-auto">
              <div className="card-lux p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <LockKeyhole className="w-5 h-5 text-gold mt-0.5" />
                  <div>
                    <h3 className="font-bold">Fecho de Caixa Cego</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Conte o dinheiro na gaveta e digite os valores dos comprovativos. O sistema <b>não mostra</b> se falta ou sobra -
                      a conferência é feita pelo gerente.
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">💵 Dinheiro contado na gaveta (MT) *</Label>
                    <Input type="number" inputMode="decimal" value={closeForm.cash} onChange={(e) => setCloseForm({ ...closeForm, cash: e.target.value })} placeholder="Ex: 4500" />
                  </div>
                  <div>
                    <Label className="text-xs">💳 Comprovativos POS (MT)</Label>
                    <Input type="number" inputMode="decimal" value={closeForm.pos} onChange={(e) => setCloseForm({ ...closeForm, pos: e.target.value })} placeholder="Soma dos talões do POS" />
                  </div>
                  <div className="rounded-lg border border-gold/30 bg-accent/40 p-3 space-y-2.5">
                    <p className="text-[11px] font-semibold text-gold uppercase tracking-wide">📱 Carteiras móveis - uma por operadora</p>
                    <p className="text-[11px] text-muted-foreground -mt-1">Some as SMS de recebimento de CADA carteira. O sistema compara automaticamente com as vendas do turno.</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] text-red-600 dark:text-red-400 font-semibold">M-Pesa (Vodacom)</Label>
                        <Input type="number" inputMode="decimal" value={closeForm.mpesa} onChange={(e) => setCloseForm({ ...closeForm, mpesa: e.target.value })} placeholder="0" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-orange-600 dark:text-orange-400 font-semibold">e-Mola (Movitel)</Label>
                        <Input type="number" inputMode="decimal" value={closeForm.emola} onChange={(e) => setCloseForm({ ...closeForm, emola: e.target.value })} placeholder="0" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold">mKesh (Tmcel)</Label>
                        <Input type="number" inputMode="decimal" value={closeForm.mkesh} onChange={(e) => setCloseForm({ ...closeForm, mkesh: e.target.value })} placeholder="0" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Observação (opcional)</Label>
                    <Textarea rows={2} value={closeForm.note} onChange={(e) => setCloseForm({ ...closeForm, note: e.target.value })} placeholder="Ex: troco ficou curto, cliente fica de dever…" />
                  </div>
                  <Button className="btn-gold w-full h-11" onClick={doClosing} disabled={closing || !online}>
                    {closing ? <><Loader2 className="w-4 h-4 animate-spin" /> A fechar...</> : "Fechar Turno"}
                  </Button>
                  {!online && <p className="text-xs text-amber-600 text-center">O fecho de caixa exige ligação ao servidor.</p>}
                </div>
              </div>

              <div className="card-lux p-4 mt-4">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Os meus últimos fechos</h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {closings.map((c) => (
                    <div key={c.id} className="flex justify-between text-sm px-3 py-2 bg-muted/50 rounded-lg">
                      <span className="text-xs">{fmtDateTime(c.closedAt)}</span>
                      <span className="text-xs text-muted-foreground">contou {mt(c.countedCash)} em dinheiro</span>
                    </div>
                  ))}
                  {closings.length === 0 && <p className="text-xs text-muted-foreground">Ainda sem fechos.</p>}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ---------- Conciliação (gerente) ---------- */}
        {user.role === "GERENTE" && (
          <TabsContent value="historico">
            <div className="card-lux overflow-hidden">
              <div className="px-4 py-3 border-b bg-muted/40">
                <h3 className="font-semibold text-sm">Conciliação de Caixa · Quebras e Sobras (confidencial)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Comparação entre o contado pelo operador e o esperado pelo sistema - agora por CARTEIRA (M-Pesa, e-Mola e mKesh separados).
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Turno fechado</TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead className="text-right">💵 Dinheiro (contado/esp.)</TableHead>
                      <TableHead className="text-right">💳 POS</TableHead>
                      <TableHead className="text-right">📱 M-Pesa</TableHead>
                      <TableHead className="text-right">🟠 e-Mola</TableHead>
                      <TableHead className="text-right">🔵 mKesh</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closings.map((c) => {
                      const legado = c.expectedEmola === null || c.expectedEmola === undefined; // fecho no formato antigo (carteiras mescladas)
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs">{fmtDateTime(c.closedAt)}</TableCell>
                          <TableCell className="text-sm">{c.userName}</TableCell>
                          <TableCell className="text-right">
                            <p className="text-xs">{mt(c.countedCash)} <span className="text-muted-foreground">/ {mt(c.expectedCash ?? 0)}</span></p>
                            <DifBadge d={c.diffCash ?? 0} />
                          </TableCell>
                          <TableCell className="text-right"><DifBadge d={c.diffPos ?? 0} /></TableCell>
                          <TableCell className="text-right">
                            {legado ? (
                              <p className="text-[11px] text-muted-foreground" title="Fecho antigo: M-Pesa + e-Mola + mKesh somados">MM <DifBadge d={c.diffMpesa} /></p>
                            ) : (
                              <div>
                                <p className="text-xs">{mt(c.countedMpesa)} <span className="text-muted-foreground">/ {mt(c.expectedMpesa ?? 0)}</span></p>
                                <DifBadge d={c.diffMpesa} />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {legado ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : (
                              <div>
                                <p className="text-xs">{mt(c.countedEmola ?? 0)} <span className="text-muted-foreground">/ {mt(c.expectedEmola ?? 0)}</span></p>
                                <DifBadge d={c.diffEmola} />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {legado ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : (
                              <div>
                                <p className="text-xs">{mt(c.countedMkesh ?? 0)} <span className="text-muted-foreground">/ {mt(c.expectedMkesh ?? 0)}</span></p>
                                <DifBadge d={c.diffMkesh} />
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {closings.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">Sem fechos registados.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <p className="text-[11px] text-muted-foreground px-4 py-2.5 border-t">
                Legenda: contado/esperado · ✓ certo · verde = sobra (+) · vermelho = falta (−) · MM = fecho antigo com carteiras somadas.
              </p>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* ----- Dialog: gerir despesas fixas ----- */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings2 className="w-4 h-4 text-gold" /> Despesas Fixas</DialogTitle>
            <DialogDescription>
              Adicione ou remova categorias (ex: INSS, Contabilista, Renda). Fica guardado - amanhã pode acrescentar mais.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}
                placeholder="Ex: INSS, Contabilista, Entrega de água…"
              />
              <Button className="btn-gold shrink-0" onClick={addCategory} disabled={catSaving || !newCat.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {categories.map((c) => (
                <div key={c} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm">{c}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive p-1"
                    title="Remover categoria"
                    disabled={catSaving || categories.length <= 1}
                    onClick={() => removeCategory(c)}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">As alterações são guardadas automaticamente. Despesas já registadas mantêm a categoria original.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
