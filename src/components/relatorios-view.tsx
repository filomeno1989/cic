"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mt, fmtDateTime, methodLabel } from "@/lib/format";
import { wallClockMZ, mzMidnight, mzEndOfDay, currentMonthMZ } from "@/lib/tz";
import type { SaleFlat, SessionUser, ProductVariantFlat, CustomerFlat } from "@/lib/types";
import { Receipt, Ban, Loader2, Search, FileDown, ShoppingCart, Wallet, Package, TrendingDown, TrendingUp, Users2, CalendarDays, Percent, Boxes, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ManagerPinDialog } from "@/components/manager-pin";
import { ReceiptDialog, type StoreInfo } from "@/components/receipt";
import { salesReportPdf, debtorsReportPdf, stockReportPdf, expensesReportPdf, payrollReportPdf, lucroReportPdf } from "@/lib/pdf";

type Expense = { id: string; category: string; description: string | null; amount: number; date: string; user?: { name: string } };

type LucroData = {
  resumo: {
    receita: number; custo: number; lucroBruto: number; despesas: number;
    lucroLiquido: number; margemPct: number; margemLiquidaPct: number;
    comissoes: number; vendasCount: number; ticketMedio: number;
    anuladasCount: number; anuladasValor: number; creditado: number;
  };
  porProduto: Array<{ nome: string; variante: string; qty: number; receita: number; custo: number; lucro: number; margemPct: number }>;
  porMetodo: Array<{ metodo: string; total: number }>;
  stock: { valorCusto: number; valorRetalho: number; unidades: number };
  previsto: {
    lucroPotencial: number; vendaPotencial: number; custoTotal: number;
    unidades: number; artigos: number; margemPct: number;
    porProduto: Array<{ nome: string; categoria: string; variante: string; unidades: number; venda: number; custo: number; lucro: number }>;
  };
};

type PeriodKey = "hoje" | "7d" | "mes" | "mespassado" | "tudo";

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "mes", label: "Este mês" },
  { key: "mespassado", label: "Mês passado" },
  { key: "tudo", label: "Todo o histórico" },
];

// v2.6 (D9 da auditoria): os períodos derivam do relógio de MAPUTO, não do
// relógio do aparelho (que pode estar com fuso/hora errada). Os instantes
// from/to são reais (corretos em qualquer fuso) e as etiquetas mostram a
// data de Maputo.
function periodRange(p: PeriodKey): { from: Date | null; to: Date | null; fromLabel: string; toLabel: string } {
  const w = wallClockMZ(); // getters UTC = hora de parede de Maputo
  const Y = w.getUTCFullYear(), M = w.getUTCMonth(), D = w.getUTCDate();
  const d = (x: Date) => x.toLocaleDateString("pt-PT", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
  if (p === "hoje") {
    return { from: mzMidnight(Y, M, D), to: null, fromLabel: d(w), toLabel: d(w) };
  }
  if (p === "7d") {
    return { from: mzMidnight(Y, M, D - 6), to: null, fromLabel: d(new Date(w.getTime() - 6 * 86400000)), toLabel: d(w) };
  }
  if (p === "mes") {
    return { from: mzMidnight(Y, M, 1), to: mzEndOfDay(Y, M, D), fromLabel: d(new Date(Date.UTC(Y, M, 1))), toLabel: d(w) };
  }
  if (p === "mespassado") {
    return { from: mzMidnight(Y, M - 1, 1), to: mzEndOfDay(Y, M - 1, new Date(Date.UTC(Y, M, 0)).getUTCDate()), fromLabel: d(new Date(Date.UTC(Y, M - 1, 1))), toLabel: d(new Date(Date.UTC(Y, M, 0))) };
  }
  return { from: null, to: null, fromLabel: "Início", toLabel: d(w) };
}

export function RelatoriosView({
  user, store, onSalesChanged,
}: {
  user: SessionUser;
  store: StoreInfo;
  onSalesChanged: () => void;
}) {
  const { toast } = useToast();
  const [sales, setSales] = useState<SaleFlat[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [receiptSale, setReceiptSale] = useState<SaleFlat | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<SaleFlat | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const isManager = user.role === "GERENTE";

  // PDF
  const [period, setPeriod] = useState<PeriodKey>("mes");
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [payrollMonth, setPayrollMonth] = useState(() => currentMonthMZ());

  // ---------- LUCRO (v2.7) ----------
  const [tab, setTab] = useState("vendas");
  const [lucroPeriod, setLucroPeriod] = useState<PeriodKey>("mes");
  const [lucroData, setLucroData] = useState<LucroData | null>(null);
  const [lucroLoading, setLucroLoading] = useState(false);

  const loadLucro = useCallback(async (p: PeriodKey) => {
    setLucroLoading(true);
    try {
      const { from, to } = periodRange(p);
      const params = new URLSearchParams();
      if (from) params.set("from", from.toISOString());
      if (to) params.set("to", to.toISOString()); // to sai no fim do dia de Maputo
      const res = await fetch(`/api/lucro?${params}`);
      if (res.ok) setLucroData(await res.json());
    } catch { /* offline */ } finally {
      setLucroLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isManager && tab === "lucro") loadLucro(lucroPeriod);
  }, [isManager, tab, lucroPeriod, loadLucro]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sales?limit=150");
      if (res.ok) setSales(await res.json());
    } catch { /* offline */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sales;
    return sales.filter(
      (s) =>
        String(s.number).includes(q) ||
        s.customer?.name?.toLowerCase().includes(q) ||
        s.user?.name?.toLowerCase().includes(q) ||
        s.items.some((i) => i.name.toLowerCase().includes(q))
    );
  }, [sales, search]);

  const openReceipt = (s: SaleFlat) => {
    setReceiptSale(s);
    setReceiptOpen(true);
  };

  const doVoid = async (pin: string) => {
    if (!voidTarget) return;
    setVoiding(true);
    try {
      const res = await fetch(`/api/sales/${voidTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerPin: pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      toast({ title: `Venda #${String(voidTarget.number).padStart(5, "0")} anulada`, description: "Stock devolvido ao inventário." });
      setVoidTarget(null);
      load();
      onSalesChanged();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao anular", variant: "destructive" });
    } finally {
      setVoiding(false);
    }
  };

  // ---------- Geradores de PDF ----------
  const generate = async (key: string, fn: () => Promise<void>, done: string) => {
    setPdfBusy(key);
    try {
      await fn();
      toast({ title: "PDF gerado", description: done });
    } catch (e) {
      toast({ title: "Erro ao gerar PDF", description: e instanceof Error ? e.message : "Tente novamente", variant: "destructive" });
    } finally {
      setPdfBusy(null);
    }
  };

  const genSales = () =>
    generate("vendas", async () => {
      const { from, to, fromLabel, toLabel } = periodRange(period);
      const params = new URLSearchParams({ limit: "1000" });
      if (from) params.set("from", from.toISOString());
      if (to) params.set("to", to.toISOString()); // to já sai de periodRange no fim do dia de Maputo
      const res = await fetch(`/api/sales?${params}`);
      if (!res.ok) throw new Error("Não foi possível carregar as vendas");
      const data: SaleFlat[] = await res.json();
      await salesReportPdf({
        store,
        generatedBy: user.name,
        fromLabel,
        toLabel,
        sales: data.map((s) => ({
          number: s.number, createdAt: s.createdAt, clientCreatedAt: s.clientCreatedAt,
          status: s.status, total: s.total, seller: s.user?.name, customerName: s.customer?.name ?? null,
          items: s.items, payments: s.payments, isCredit: s.isCredit, offline: s.offline,
        })),
      });
    }, "Relatório de vendas descarregado.");

  const genDebtors = () =>
    generate("fiacao", async () => {
      const res = await fetch("/api/customers");
      if (!res.ok) throw new Error("Não foi possível carregar os clientes");
      const data: CustomerFlat[] = await res.json();
      await debtorsReportPdf({ store, generatedBy: user.name, customers: data });
    }, "Relatório de fiação descarregado.");

  const genStock = () =>
    generate("stock", async () => {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Não foi possível carregar o stock");
      const data: ProductVariantFlat[] = await res.json();
      await stockReportPdf({
        store, generatedBy: user.name,
        variants: data.map((v) => ({
          productCode: v.productCode, productName: v.productName, color: v.color, size: v.size,
          category: v.category, brand: v.brand, stock: v.stock, minStock: v.minStock,
          costPrice: v.costPrice, retailPrice: v.retailPrice, wholesalePrice: v.wholesalePrice,
          expiryDate: v.expiryDate,
        })),
      });
    }, "Inventário descarregado.");

  const genExpenses = () =>
    generate("despesas", async () => {
      const { from, to, fromLabel, toLabel } = periodRange(period);
      const res = await fetch("/api/expenses?limit=300");
      if (!res.ok) throw new Error("Não foi possível carregar as despesas");
      let data: Expense[] = await res.json();
      if (from) data = data.filter((e) => new Date(e.date) >= from);
      if (to) data = data.filter((e) => new Date(e.date) <= to);
      await expensesReportPdf({
        store, generatedBy: user.name, fromLabel, toLabel,
        expenses: data.map((e) => ({
          category: e.category, description: e.description, amount: e.amount,
          date: e.date, userName: e.user?.name,
        })),
      });
    }, "Relatório de despesas descarregado.");

  const genPayroll = () =>
    generate("folha", async () => {
      const res = await fetch(`/api/payroll?month=${payrollMonth}`);
      if (!res.ok) throw new Error("Não foi possível carregar a folha");
      const data = await res.json();
      await payrollReportPdf({ store, generatedBy: user.name, payroll: data });
    }, "Folha salarial descarregada.");

  const genLucro = () =>
    generate("lucro", async () => {
      if (!lucroData) throw new Error("Os números do lucro ainda não carregaram");
      const { fromLabel, toLabel } = periodRange(lucroPeriod);
      await lucroReportPdf({
        store, generatedBy: user.name, fromLabel, toLabel,
        lucro: { ...lucroData.resumo, porProduto: lucroData.porProduto, porMetodo: lucroData.porMetodo, stock: lucroData.stock, previsto: lucroData.previsto },
      });
    }, "Relatório de lucro descarregado.");

  const pdfBusyIcon = (key: string) =>
    pdfBusy === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} defaultValue="vendas">
        <TabsList>
          <TabsTrigger value="vendas" className="gap-1.5"><ShoppingCart className="w-3.5 h-3.5" /> Vendas</TabsTrigger>
          {isManager && <TabsTrigger value="lucro" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Lucro</TabsTrigger>}
          {isManager && <TabsTrigger value="pdf" className="gap-1.5"><FileDown className="w-3.5 h-3.5" /> Relatórios PDF</TabsTrigger>}
        </TabsList>

        {/* ---------- Lista de vendas (existente) ---------- */}
        <TabsContent value="vendas" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Procurar por nº, cliente, vendedor ou produto…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="text-sm text-muted-foreground">
              Total listado: <span className="font-bold text-gold">{mt(filtered.filter((s) => s.status === "CONCLUIDA").reduce((a, s) => a + s.total, 0))}</span>
            </div>
          </div>

          <div className="card-lux overflow-hidden">
            <div className="overflow-x-auto max-h-[calc(100vh-300px)] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Itens</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} className={s.status === "ANULADA" ? "opacity-45" : ""}>
                      <TableCell className="font-mono text-xs font-bold">#{String(s.number).padStart(5, "0")}{s.offline && <Badge variant="secondary" className="ml-1 text-[9px] px-1">off</Badge>}</TableCell>
                      <TableCell className="text-xs">{fmtDateTime(s.clientCreatedAt ?? s.createdAt)}</TableCell>
                      <TableCell className="text-xs">{s.user?.name}</TableCell>
                      <TableCell className="text-xs">{s.customer?.name ?? "-"}</TableCell>
                      <TableCell className="text-xs max-w-52 truncate" title={s.items.map((i) => `${i.qty}x ${i.name}`).join(", ")}>
                        {s.items.map((i) => `${i.qty}x ${i.name}`).join(", ")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.payments.map((p) => methodLabel(p.method)).join(" + ")}
                        {s.isCredit && <span className="text-amber-600 font-semibold"> · fiação</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm font-bold">
                        {mt(s.total)}
                        {s.status === "ANULADA" && <Badge variant="destructive" className="ml-1.5 text-[9px] px-1">ANULADA</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => openReceipt(s)} title="Ver recibo">
                            <Receipt className="w-3.5 h-3.5" />
                          </Button>
                          {isManager && s.status === "CONCLUIDA" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-destructive"
                              title="Anular (exige PIN)"
                              onClick={() => { setVoidTarget(s); setPinOpen(true); }}
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && filtered.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10 text-sm">Nenhuma venda encontrada.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ---------- LUCRO (v2.7 - pedido da Cleide) ---------- */}
        {isManager && (
          <TabsContent value="lucro" className="space-y-4">
            <div className="card-lux p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm">Lucro do período</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Vendas − custo das mercadorias − despesas. O custo usado é o gravado no momento de cada venda.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setLucroPeriod(p.key)}
                    className={`px-3 h-8 rounded-full text-xs font-medium border transition-all ${
                      lucroPeriod === p.key ? "border-gold bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:border-gold/50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <Button size="sm" className="btn-gold h-8 rounded-full px-3" onClick={genLucro} disabled={pdfBusy !== null || !lucroData}>
                  {pdfBusyIcon("lucro")} PDF
                </Button>
              </div>
            </div>

            {lucroLoading && !lucroData ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-gold" />
              </div>
            ) : lucroData ? (
              <>
                {/* KPIs do período */}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                  <div className="card-lux p-4 ring-1 ring-gold/40">
                    <TrendingUp className="w-4 h-4 mb-2 text-gold" />
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Receita</p>
                    <p className="text-lg font-bold mt-0.5">{mt(lucroData.resumo.receita)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{lucroData.resumo.vendasCount} venda(s) · ticket {mt(lucroData.resumo.ticketMedio)}</p>
                  </div>
                  <div className="card-lux p-4">
                    <Package className="w-4 h-4 mb-2 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Custo das mercadorias</p>
                    <p className="text-lg font-bold mt-0.5">{mt(lucroData.resumo.custo)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">o que os artigos custaram</p>
                  </div>
                  <div className="card-lux p-4">
                    <TrendingUp className="w-4 h-4 mb-2 text-emerald-600" />
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Lucro bruto</p>
                    <p className={`text-lg font-bold mt-0.5 ${lucroData.resumo.lucroBruto < 0 ? "text-destructive" : "text-emerald-600"}`}>{mt(lucroData.resumo.lucroBruto)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">margem {lucroData.resumo.margemPct.toFixed(1)}%</p>
                  </div>
                  <div className="card-lux p-4">
                    <TrendingDown className="w-4 h-4 mb-2 text-destructive" />
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Despesas</p>
                    <p className="text-lg font-bold mt-0.5 text-destructive">{mt(lucroData.resumo.despesas)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">saídas registadas do período</p>
                  </div>
                  <div className="card-lux p-4 ring-1 ring-gold/40">
                    <Wallet className="w-4 h-4 mb-2 text-gold" />
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Lucro líquido</p>
                    <p className={`text-lg font-bold mt-0.5 ${lucroData.resumo.lucroLiquido < 0 ? "text-destructive" : "text-gold"}`}>{mt(lucroData.resumo.lucroLiquido)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">margem líquida {lucroData.resumo.margemLiquidaPct.toFixed(1)}%</p>
                  </div>
                  <div className="card-lux p-4">
                    <Boxes className="w-4 h-4 mb-2 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Stock actual</p>
                    <p className="text-lg font-bold mt-0.5">{mt(lucroData.stock.valorCusto)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{lucroData.stock.unidades} un. · {mt(lucroData.stock.valorRetalho)} a retalho</p>
                  </div>
                </div>

                {/* Contexto extra */}
                <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground px-1">
                  <span><Percent className="w-3 h-3 inline mr-1 text-gold" />Comissões do período: <b className="text-foreground">{mt(lucroData.resumo.comissoes)}</b></span>
                  <span>Vendas a fiação do período: <b className="text-foreground">{mt(lucroData.resumo.creditado)}</b> (receita ainda por receber)</span>
                  <span>Anuladas: <b className="text-foreground">{lucroData.resumo.anuladasCount}</b> ({mt(lucroData.resumo.anuladasValor)}) - não contam para o lucro</span>
                </div>

                {/* v2.8: PREVISÃO - se vender todo o stock actual (pedido da Cleyde) */}
                <div className="card-lux p-4 ring-1 ring-gold/40 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                        <Sparkles className="w-4.5 h-4.5 text-gold" />
                      </span>
                      <div>
                        <h3 className="font-semibold text-sm">Previsão de lucro - se vender todo o stock actual</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                          Estimativa aos preços e custos de hoje - não prevê quebras, descontos, promoções nem vendas fiado. (Independente do período escolhido.)
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-emerald-600">{mt(lucroData.previsto.lucroPotencial)}</p>
                      <p className="text-[11px] text-muted-foreground">margem prevista {lucroData.previsto.margemPct.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground px-1">
                    <span>Unidades em loja: <b className="text-foreground">{lucroData.previsto.unidades}</b></span>
                    <span>Artigos: <b className="text-foreground">{lucroData.previsto.artigos}</b></span>
                    <span>Venda potencial: <b className="text-foreground">{mt(lucroData.previsto.vendaPotencial)}</b></span>
                    <span>Custo da mercadoria: <b className="text-foreground">{mt(lucroData.previsto.custoTotal)}</b></span>
                  </div>
                  {lucroData.previsto.porProduto.length > 0 && (
                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto rounded-lg border border-border/60">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Produto</TableHead>
                            <TableHead>Unid.</TableHead>
                            <TableHead className="text-right">Venda</TableHead>
                            <TableHead className="text-right">Lucro previsto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lucroData.previsto.porProduto.map((p, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="text-sm">
                                {p.nome}
                                {p.variante && <span className="text-gold text-xs ml-1.5">{p.variante}</span>}
                              </TableCell>
                              <TableCell className="text-xs font-bold">{p.unidades}</TableCell>
                              <TableCell className="text-right text-xs">{mt(p.venda)}</TableCell>
                              <TableCell className={`text-right text-sm font-bold ${p.lucro < 0 ? "text-destructive" : "text-emerald-600"}`}>{mt(p.lucro)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Ranking de produtos */}
                <div className="card-lux overflow-hidden">
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <h3 className="text-sm font-semibold">Produtos por lucro no período</h3>
                    <span className="text-xs text-muted-foreground">{lucroData.porProduto.length} artigo(s) vendido(s)</span>
                  </div>
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead>Qtd</TableHead>
                          <TableHead className="text-right">Receita</TableHead>
                          <TableHead className="text-right">Custo</TableHead>
                          <TableHead className="text-right">Lucro</TableHead>
                          <TableHead className="text-right">Margem</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lucroData.porProduto.map((p, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="text-sm">
                              {p.nome}
                              {p.variante && <span className="text-gold text-xs ml-1.5">{p.variante}</span>}
                            </TableCell>
                            <TableCell className="text-xs font-bold">{p.qty}</TableCell>
                            <TableCell className="text-right text-xs">{mt(p.receita)}</TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">{mt(p.custo)}</TableCell>
                            <TableCell className={`text-right text-sm font-bold ${p.lucro < 0 ? "text-destructive" : "text-emerald-600"}`}>{mt(p.lucro)}</TableCell>
                            <TableCell className="text-right text-xs">{p.margemPct.toFixed(1)}%</TableCell>
                          </TableRow>
                        ))}
                        {lucroData.porProduto.length === 0 && (
                          <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10 text-sm">Nenhuma venda neste período.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            ) : (
              <div className="card-lux p-8 text-center text-sm text-muted-foreground">
                Não foi possível carregar o lucro (sem internet?). Tenta novamente ao recuperar a ligação.
              </div>
            )}
          </TabsContent>
        )}

        {/* ---------- Relatórios PDF (gerente) ---------- */}
        {isManager && (
          <TabsContent value="pdf" className="space-y-4">
            <div className="card-lux p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-sm">Período dos relatórios</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Aplica-se a vendas e despesas. A fiação e o stock são sempre actuais.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
                    className={`px-3 h-8 rounded-full text-xs font-medium border transition-all ${
                      period === p.key ? "border-gold bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:border-gold/50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <div className="card-lux p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center"><ShoppingCart className="w-4.5 h-4.5 text-gold" /></span>
                  <h4 className="font-semibold text-sm">Vendas & Facturação</h4>
                </div>
                <p className="text-xs text-muted-foreground flex-1">Total facturado, ticket médio, anuladas e discriminação por forma de pagamento (M-Pesa, e-Mola, POS…) com lista de vendas.</p>
                <Button className="btn-gold w-full" onClick={genSales} disabled={pdfBusy !== null}>
                  {pdfBusyIcon("vendas")} Gerar PDF
                </Button>
              </div>

              <div className="card-lux p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center"><Wallet className="w-4.5 h-4.5 text-gold" /></span>
                  <h4 className="font-semibold text-sm">Fiação - Devedores</h4>
                </div>
                <p className="text-xs text-muted-foreground flex-1">Lista de clientes com saldo devedor, contactos WhatsApp e total a receber - ideal para cobranças da semana.</p>
                <Button className="btn-gold w-full" onClick={genDebtors} disabled={pdfBusy !== null}>
                  {pdfBusyIcon("fiacao")} Gerar PDF
                </Button>
              </div>

              <div className="card-lux p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center"><Package className="w-4.5 h-4.5 text-gold" /></span>
                  <h4 className="font-semibold text-sm">Stock / Inventário</h4>
                </div>
                <p className="text-xs text-muted-foreground flex-1">Existências por variante, valor do stock a custo e a retalho, alertas de stock baixo e validades próximas.</p>
                <Button className="btn-gold w-full" onClick={genStock} disabled={pdfBusy !== null}>
                  {pdfBusyIcon("stock")} Gerar PDF
                </Button>
              </div>

              <div className="card-lux p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center"><TrendingDown className="w-4.5 h-4.5 text-gold" /></span>
                  <h4 className="font-semibold text-sm">Despesas da Loja</h4>
                </div>
                <p className="text-xs text-muted-foreground flex-1">Saídas do caixa no período (Credelec, FIPAG, chapa, salários…) com resumo por categoria.</p>
                <Button className="btn-gold w-full" onClick={genExpenses} disabled={pdfBusy !== null}>
                  {pdfBusyIcon("despesas")} Gerar PDF
                </Button>
              </div>

              <div className="card-lux p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center"><Users2 className="w-4.5 h-4.5 text-gold" /></span>
                  <h4 className="font-semibold text-sm">Folha Salarial</h4>
                </div>
                <p className="text-xs text-muted-foreground flex-1">Salário base + comissões − vales por funcionário, com totais para assinatura de salário.</p>
                <div className="flex gap-2">
                  <Input type="month" value={payrollMonth} onChange={(e) => setPayrollMonth(e.target.value)} className="h-9 text-xs" />
                  <Button className="btn-gold flex-1 h-9" onClick={genPayroll} disabled={pdfBusy !== null}>
                    {pdfBusyIcon("folha")} <CalendarDays className="w-4 h-4" /> PDF
                  </Button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              Os PDF são gerados no próprio dispositivo - funcionam mesmo sem internet e podem ser partilhados por WhatsApp ou impressos.
            </p>
          </TabsContent>
        )}
      </Tabs>

      <ReceiptDialog sale={receiptSale} store={store} open={receiptOpen} onOpenChange={setReceiptOpen} />
      <ManagerPinDialog
        open={pinOpen}
        onOpenChange={(v) => { setPinOpen(v); if (!v) setVoidTarget(null); }}
        onSuccess={(pin) => doVoid(pin)}
        title="Anular Venda"
        description={`A anulação da venda #${voidTarget ? String(voidTarget.number).padStart(5, "0") : ""} devolve o stock e exige PIN do gerente.`}
      />

      {voiding && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <Loader2 className="w-8 h-8 animate-spin text-gold" />
        </div>
      )}
    </div>
  );
}
