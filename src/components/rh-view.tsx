"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mt, fmtDate, fmtDateTime } from "@/lib/format";
import { currentMonthMZ } from "@/lib/tz";
import { fetchT } from "@/lib/http";
import type { SessionUser } from "@/lib/types";
import { UserPlus, HandCoins, Loader2, Trash2, FileSpreadsheet, Users2, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Employee = {
  id: string; name: string; role: string; active: boolean; phone: string | null;
  baseSalary: number; commissionPct: number; createdAt: string;
};
type Vale = { id: string; amount: number; reason: string | null; date: string; user: { name: string; role: string }; userId: string };
type Payroll = {
  month: string;
  rows: Array<{ userId: string; name: string; role: string; baseSalary: number; commissionPct: number; salesTotal: number; commissions: number; vales: number; toPay: number }>;
};

export function RhView({ user }: { user: SessionUser }) {
  const { toast } = useToast();
  const isManager = user.role === "GERENTE";
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vales, setVales] = useState<Vale[]>([]);
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [month, setMonth] = useState(() => currentMonthMZ()); // v2.6 (D9): mês de MAPUTO, não UTC do aparelho

  const [empOpen, setEmpOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({ name: "", pin: "", role: "CAIXA", baseSalary: "", commissionPct: "", phone: "" });
  const [savingEmp, setSavingEmp] = useState(false);
  const savingEmpRef = useRef(false); // trava anti-duplo-clique (mesma cura do stock duplicado)

  const [valeOpen, setValeOpen] = useState(false);
  const [valeForm, setValeForm] = useState({ userId: "", amount: "", reason: "" });
  const [savingVale, setSavingVale] = useState(false);
  const savingValeRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [uRes, vRes, pRes] = await Promise.all([
        fetchT("/api/users"),
        fetchT("/api/vales"),
        fetchT(`/api/payroll?month=${month}`),
      ]);
      if (uRes.ok) setEmployees(await uRes.json());
      if (vRes.ok) setVales(await vRes.json());
      if (pRes.ok) setPayroll(await pRes.json());
    } catch { /* offline */ }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const openNewEmp = () => {
    setEditingEmp(null);
    setEmpForm({ name: "", pin: "", role: "CAIXA", baseSalary: "", commissionPct: "", phone: "" });
    setEmpOpen(true);
  };

  const openEditEmp = (e: Employee) => {
    setEditingEmp(e);
    setEmpForm({ name: e.name, pin: "", role: e.role, baseSalary: String(e.baseSalary), commissionPct: String(e.commissionPct), phone: e.phone ?? "" });
    setEmpOpen(true);
  };

  const saveEmp = async () => {
    if (savingEmpRef.current) return; // DUPLO-CLIQUE BLOQUEADO
    if (!empForm.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (!editingEmp && empForm.pin.length < 4) {
      toast({ title: "PIN deve ter pelo menos 4 dígitos", variant: "destructive" });
      return;
    }
    setSavingEmp(true);
    savingEmpRef.current = true;
    try {
      const payload: Record<string, unknown> = {
        name: empForm.name,
        role: empForm.role,
        baseSalary: parseFloat(empForm.baseSalary) || 0,
        commissionPct: parseFloat(empForm.commissionPct) || 0,
        phone: empForm.phone,
        ...(empForm.pin ? { pin: empForm.pin } : {}),
      };
      const res = editingEmp
        ? await fetchT(`/api/users/${editingEmp.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetchT("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro");
      }
      toast({ title: editingEmp ? "Funcionário atualizado" : "Funcionário registado" });
      setEmpOpen(false);
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      savingEmpRef.current = false;
      setSavingEmp(false);
    }
  };

  const addVale = async () => {
    if (savingValeRef.current) return; // DUPLO-CLIQUE BLOQUEADO
    const amount = parseFloat(valeForm.amount);
    if (!valeForm.userId || !amount || amount <= 0) {
      toast({ title: "Selecione funcionário e valor válido", variant: "destructive" });
      return;
    }
    setSavingVale(true);
    savingValeRef.current = true;
    try {
      const res = await fetchT("/api/vales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: valeForm.userId, amount, reason: valeForm.reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro ao registar vale");
      }
      toast({ title: "Vale registado", description: `${mt(amount)} de adiantamento` });
      setValeOpen(false);
      setValeForm({ userId: "", amount: "", reason: "" });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro de rede - verifique a internet", variant: "destructive" });
    } finally {
      savingValeRef.current = false;
      setSavingVale(false);
    }
  };

  const deleteVale = async (id: string) => {
    if (!confirm("Eliminar este vale?")) return;
    try {
      const res = await fetchT(`/api/vales/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error);
      }
      toast({ title: "Vale eliminado" });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    }
  };

  // ---- Gestão de funcionários: arquivar / restaurar / eliminar ----
  const setEmpActive = async (e: Employee, active: boolean) => {
    try {
      const res = await fetchT(`/api/users/${e.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error);
      toast({
        title: active ? "Funcionário restaurado" : "Funcionário arquivado",
        description: active ? `${e.name} volta a ter acesso ao sistema.` : `${e.name} perde o acesso, o histórico mantém-se.`,
      });
      load();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    }
  };

  const removeEmployee = async (e: Employee) => {
    if (!confirm(`Eliminar definitivamente «${e.name}»?\n\nSó é possível se NUNCA teve vendas, vales ou fechos. Caso contrário, use «Arquivar».`)) return;
    try {
      const res = await fetchT(`/api/users/${e.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Funcionário eliminado", description: e.name });
      load();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Erro ao eliminar", variant: "destructive" });
    }
  };

  const valesByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of vales) map.set(v.userId, (map.get(v.userId) ?? 0) + v.amount);
    return map;
  }, [vales]);

  if (!isManager) {
    // Caixa vê apenas os seus vales
    const myVales = vales.filter((v) => v.userId === user.id);
    const myRow = payroll?.rows.find((r) => r.userId === user.id);
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <div className="card-lux p-5">
          <h3 className="font-bold mb-1">Os meus vales deste mês</h3>
          <p className="text-xs text-muted-foreground mb-3">Adiantamentos registados serão descontados no salário.</p>
          <div className="space-y-1.5">
            {myVales.map((v) => (
              <div key={v.id} className="flex justify-between items-center text-sm px-3 py-2 bg-muted/50 rounded-lg">
                <span>{fmtDate(v.date)}{v.reason ? ` · ${v.reason}` : ""}</span>
                <span className="font-semibold text-amber-600">{mt(v.amount)}</span>
              </div>
            ))}
            {myVales.length === 0 && <p className="text-xs text-muted-foreground">Sem vales registados.</p>}
          </div>
          {myRow && (
            <div className="mt-4 pt-3 border-t text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Salário base</span><span>{mt(myRow.baseSalary)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Comissões ({myRow.commissionPct}%)</span><span className="text-green-600">+{mt(myRow.commissions)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Vales</span><span className="text-destructive">-{mt(myRow.vales)}</span></div>
              <div className="flex justify-between font-bold pt-1"><span>A receber no fim do mês</span><span className="text-gold">{mt(myRow.toPay)}</span></div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="folha">
        <TabsList>
          <TabsTrigger value="folha" className="gap-1.5"><FileSpreadsheet className="w-3.5 h-3.5" /> Folha Mensal</TabsTrigger>
          <TabsTrigger value="vales" className="gap-1.5"><HandCoins className="w-3.5 h-3.5" /> Vales</TabsTrigger>
          <TabsTrigger value="funcionarios" className="gap-1.5"><Users2 className="w-3.5 h-3.5" /> Funcionários</TabsTrigger>
        </TabsList>

        <TabsContent value="folha">
          <div className="card-lux overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b bg-muted/40">
              <h3 className="font-semibold text-sm">Valor a Pagar no Final do Mês (Salário + Comissões − Vales)</h3>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead className="text-right">Salário base</TableHead>
                  <TableHead className="text-right">Vendas do mês</TableHead>
                  <TableHead className="text-right">Comissões</TableHead>
                  <TableHead className="text-right">Vales</TableHead>
                  <TableHead className="text-right font-bold">A pagar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payroll?.rows.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell>
                      <span className="font-medium">{r.name}</span>
                      <Badge variant="outline" className="ml-2 text-[10px]">{r.role}</Badge>
                      <span className="text-[10px] text-muted-foreground ml-1">({r.commissionPct}%)</span>
                    </TableCell>
                    <TableCell className="text-right text-sm">{mt(r.baseSalary)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{mt(r.salesTotal)}</TableCell>
                    <TableCell className="text-right text-sm text-green-600">+{mt(r.commissions)}</TableCell>
                    <TableCell className="text-right text-sm text-destructive">-{mt(r.vales)}</TableCell>
                    <TableCell className="text-right font-bold text-gold">{mt(r.toPay)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="vales" className="space-y-4">
          <div className="flex justify-end">
            <Button className="btn-gold" onClick={() => setValeOpen(true)}>
              <HandCoins className="w-4 h-4 mr-1" /> Registar Vale
            </Button>
          </div>
          <div className="card-lux overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vales.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="text-xs">{fmtDateTime(v.date)}</TableCell>
                    <TableCell className="text-sm font-medium">{v.user.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{v.reason ?? "-"}</TableCell>
                    <TableCell className="text-right font-semibold text-amber-600">{mt(v.amount)}</TableCell>
                    <TableCell>
                      <button onClick={() => deleteVale(v.id)} className="text-destructive/60 hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {vales.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">Sem vales registados.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="funcionarios" className="space-y-4">
          <div className="flex justify-end">
            <Button className="btn-gold" onClick={openNewEmp}>
              <UserPlus className="w-4 h-4 mr-1" /> Novo Funcionário
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {employees.map((e) => (
              <div key={e.id} className={`card-lux p-4 space-y-2 ${!e.active ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{e.name}</p>
                  <Badge variant={e.role === "GERENTE" ? "default" : "secondary"} className={e.role === "GERENTE" ? "btn-gold" : ""}>
                    {e.role === "GERENTE" ? "Gerente" : "Caixa"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>Salário: {mt(e.baseSalary)} · Comissão: {e.commissionPct}%</p>
                  <p>Vales do mês: <span className="text-amber-600 font-medium">{mt(valesByUser.get(e.id) ?? 0)}</span></p>
                  <p>Desde {fmtDate(e.createdAt)}{!e.active && " · arquivado (sem acesso)"}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => openEditEmp(e)} disabled={!e.active && e.id !== user.id}>
                    <Pencil className="w-3 h-3 mr-1" /> Editar
                  </Button>
                  {e.id !== user.id && (
                    <>
                      {e.active ? (
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Arquivar - tira o acesso sem apagar o histórico" onClick={() => setEmpActive(e, false)}>
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Restaurar acesso" onClick={() => setEmpActive(e, true)}>
                          <ArchiveRestore className="w-3.5 h-3.5 text-green-600" />
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-destructive hover:text-destructive" title="Eliminar definitivamente (só sem histórico)" onClick={() => removeEmployee(e)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog funcionário */}
      <Dialog open={empOpen} onOpenChange={setEmpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingEmp ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nome *</Label><Input value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Nível de acesso *</Label>
                <Select value={empForm.role} onValueChange={(v) => setEmpForm({ ...empForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAIXA">Caixa (limitado)</SelectItem>
                    <SelectItem value="GERENTE">Gerente (total)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{editingEmp ? "Novo PIN (opcional)" : "PIN (4+ dígitos) *"}</Label>
                <Input type="password" inputMode="numeric" maxLength={6} value={empForm.pin} onChange={(e) => setEmpForm({ ...empForm, pin: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Salário base (MT)</Label><Input type="number" value={empForm.baseSalary} onChange={(e) => setEmpForm({ ...empForm, baseSalary: e.target.value })} /></div>
              <div><Label className="text-xs">Comissão (%)</Label><Input type="number" step="0.1" value={empForm.commissionPct} onChange={(e) => setEmpForm({ ...empForm, commissionPct: e.target.value })} /></div>
            </div>
            <div><Label className="text-xs">Telefone</Label><Input value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} placeholder="+258 84 000 0000" /></div>
            <Button className="btn-gold w-full" onClick={saveEmp} disabled={savingEmp}>
              {savingEmp ? <><Loader2 className="w-4 h-4 animate-spin" /> A guardar...</> : "Guardar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog vale */}
      <Dialog open={valeOpen} onOpenChange={setValeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Registar Vale (Adiantamento)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Funcionário *</Label>
              <Select value={valeForm.userId} onValueChange={(v) => setValeForm({ ...valeForm, userId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {employees.filter((e) => e.active).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Valor (MT) *</Label><Input type="number" value={valeForm.amount} onChange={(e) => setValeForm({ ...valeForm, amount: e.target.value })} /></div>
            <div><Label className="text-xs">Motivo</Label><Input value={valeForm.reason} onChange={(e) => setValeForm({ ...valeForm, reason: e.target.value })} placeholder="Ex: transporte, emergência familiar" /></div>
            <Button className="btn-gold w-full" onClick={addVale} disabled={savingVale}>
              {savingVale ? <><Loader2 className="w-4 h-4 animate-spin" /> A registar...</> : "Registar Vale"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
