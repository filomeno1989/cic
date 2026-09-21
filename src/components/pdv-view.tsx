"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { mt, variantLabel } from "@/lib/format";
import { getCachedProducts, cacheProducts, cacheCustomers, getCachedCustomers, suspendSale, getSuspended, resumeSuspended, enqueueSale, syncQueue, getRejected, clearRejected, storageComProblemas, type OfflineSale, type SuspendedSale } from "@/lib/offline";
import { PaymentDialog, type PayLine } from "@/components/payment-dialog";
import { ReceiptDialog, type StoreInfo } from "@/components/receipt";
import { ManagerPinDialog } from "@/components/manager-pin";
import type { CartItem, ProductVariantFlat, SaleFlat, CustomerFlat, SessionUser } from "@/lib/types";
import {
  Search, Pause, Play, Trash2, Plus, Minus, ShoppingCart, WifiOff, PackageOpen, Percent, Users, AlertTriangle, RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function PdvView({
  user, store, online, onStockChanged,
}: {
  user: SessionUser;
  store: StoreInfo;
  online: boolean;
  onStockChanged: () => void;
}) {
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<ProductVariantFlat[]>(() =>
    typeof window !== "undefined" ? (getCachedProducts() as ProductVariantFlat[]) : []
  );
  const [customers, setCustomers] = useState<CustomerFlat[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [priceType, setPriceType] = useState<"RETALHO" | "GROSSO">("RETALHO");
  const [customer, setCustomer] = useState<CustomerFlat | null>(null);
  const [discountPct, setDiscountPct] = useState(0);
  const [managerPin, setManagerPin] = useState<string | null>(null);
  const [discountDialog, setDiscountDialog] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<SaleFlat | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [suspended, setSuspended] = useState<SuspendedSale[]>([]);
  const [pinOpen, setPinOpen] = useState(false);
  const [payKey, setPayKey] = useState(0); // remonta PaymentDialog a cada abertura (estado limpo)
  // v2.6 (D8): vendas offline que o servidor RECUSOU - cartão visível no PDV
  const [recusadas, setRecusadas] = useState(() => getRejected());
  const [memoriaCheia, setMemoriaCheia] = useState(false);

  const reloadCatalog = useCallback(async (force = false) => {
    if (!online && !force) return;
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        setCatalog(data);
        cacheProducts(data);
      }
    } catch { /* offline - mantém cache */ }
  }, [online]);

  const reloadCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/customers");
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
        cacheCustomers(data); // cache p/ fiação offline
      }
    } catch {
      setCustomers(getCachedCustomers() as CustomerFlat[]);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && catalog.length === 0) {
      setCatalog(getCachedProducts() as ProductVariantFlat[]);
    }
    reloadCatalog(true);
    reloadCustomers();
    setSuspended(getSuspended());
  }, []);

  const categories = useMemo(
    () => ["Todas", ...Array.from(new Set(catalog.map((c) => c.category))).sort()],
    [catalog]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return catalog.filter((c) => {
      if (category !== "Todas" && c.category !== category) return false;
      if (!q) return true;
      const label = variantLabel(c).toLowerCase();
      return (
        c.productName.toLowerCase().includes(q) ||
        c.productCode.toLowerCase().includes(q) ||
        (c.brand ?? "").toLowerCase().includes(q) ||
        label.includes(q)
      );
    });
  }, [catalog, search, category]);

  // ----- Carrinho -----
  const unitPriceFor = (v: ProductVariantFlat, qty: number, type: "RETALHO" | "GROSSO") => {
    if (type === "GROSSO" && v.wholesalePrice && qty >= v.wholesaleMinQty) return v.wholesalePrice;
    return v.retailPrice;
  };

  const addToCart = (v: ProductVariantFlat) => {
    // Bloquear produtos SEM preço de venda: evita vendas com total 0 MT
    // (dinheiro entra mas os relatórios/folha ficam errados).
    const effective = priceType === "GROSSO" && v.wholesalePrice ? v.wholesalePrice : v.retailPrice;
    if (effective <= 0) {
      toast({
        title: "Produto sem preço de venda",
        description: `${v.productName} está a 0 MT. Defina o preço em Produtos & Stock antes de vender.`,
        variant: "destructive",
      });
      return;
    }
    if (v.stock <= 0) {
      toast({ title: "Sem stock", description: `${v.productName} (${variantLabel(v)}) esgotado`, variant: "destructive" });
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.variantId === v.id);
      if (existing) {
        if (existing.qty >= v.stock) {
          toast({ title: "Stock limitado", description: `Apenas ${v.stock} unidade(s) disponível(is)`, variant: "destructive" });
          return prev;
        }
        return prev.map((i) =>
          i.variantId === v.id ? { ...i, qty: i.qty + 1, unitPrice: unitPriceFor(v, i.qty + 1, priceType) } : i
        );
      }
      return [
        ...prev,
        { variantId: v.id, name: v.productName, variantLabel: variantLabel(v), qty: 1, unitPrice: unitPriceFor(v, 1, priceType), stock: v.stock },
      ];
    });
  };

  const changeQty = (variantId: string, delta: number) => {
    const item = cart.find((i) => i.variantId === variantId);
    if (item) {
      const newQty = item.qty + delta;
      if (newQty > item.stock) {
        toast({ title: "Stock limitado", description: `Apenas ${item.stock} disponível(is)`, variant: "destructive" });
        return;
      }
    }
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.variantId !== variantId) return i;
          const newQty = i.qty + delta;
          const v = catalog.find((c) => c.id === variantId);
          return { ...i, qty: newQty, unitPrice: v ? unitPriceFor(v, newQty, priceType) : i.unitPrice };
        })
        .filter((i) => i.qty > 0)
    );
  };

  const subtotal = cart.reduce((a, i) => a + i.unitPrice * i.qty, 0);
  const discount = (subtotal * discountPct) / 100;
  const total = Math.max(0, subtotal - discount);

  const applyDiscount = () => {
    const pct = parseFloat(discountInput) || 0;
    if (pct < 0 || pct > 100) return;
    if (pct > 10 && user.role !== "GERENTE" && !managerPin) {
      setDiscountDialog(false);
      setPinOpen(true);
      return;
    }
    setDiscountPct(pct);
    setDiscountDialog(false);
    setDiscountInput("");
    toast({ title: `Desconto de ${pct}% aplicado` });
  };

  const onPinOk = (pin: string) => {
    setManagerPin(pin);
    setPinOpen(false);
    setDiscountDialog(true);
  };

  // ----- Suspender / retomar -----
  const doSuspend = () => {
    if (cart.length === 0) return;
    const s: SuspendedSale = {
      id: `sus-${Date.now()}`,
      label: customer?.name ?? cart[0].name,
      at: new Date().toISOString(),
      cart,
      customerId: customer?.id ?? null,
      priceType,
    };
    suspendSale(s);
    setSuspended(getSuspended());
    setCart([]);
    setCustomer(null);
    setDiscountPct(0);
    toast({ title: "Venda em espera", description: "A fila do caixa ficou livre." });
  };

  const doResume = (id: string) => {
    const s = resumeSuspended(id);
    if (!s) return;
    setSuspended(getSuspended());
    setCart(s.cart as CartItem[]);
    setPriceType(s.priceType);
    if (s.customerId) {
      const cust = customers.find((c) => c.id === s.customerId) ?? null;
      setCustomer(cust);
    }
    toast({ title: "Venda retomada" });
  };

  // ----- Finalização (com fallback offline) -----
  const finalize = async (lines: PayLine[], _received: number) => {
    setSubmitting(true);
    const payload = {
      userId: user.id,
      customerId: customer?.id ?? null,
      priceType,
      discount,
      localId: `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, // v2.4: idempotência - o servidor nunca duplica esta venda
      // v2.5 (S3): se um gerente autorizou o desconto >10%, o PIN acompanha a
      // venda para o SERVIDOR confirmar de novo (a interface sozinha não basta).
      ...(managerPin ? { gerentePin: managerPin } : {}),
      items: cart.map((i) => ({ variantId: i.variantId, qty: i.qty, unitPrice: i.unitPrice, name: i.name, variantLabel: i.variantLabel })),
      payments: lines.map((l) => ({ method: l.method, amount: l.amount, change: l.change ?? 0, reference: l.reference })),
    };

    let res: Response | null = null;
    try {
      res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro ao registar venda");
      }
      const sale: SaleFlat = await res.json();
      finishSuccess(sale);
    } catch (e) {
      // Se o SERVIDOR respondeu (rede OK) mas recusou a venda (stock, fiação...),
      // NÃO guardar offline - mostrar o erro e deixar corrigir a venda.
      // Só guardar offline quando a REDE falhou (sem resposta do servidor).
      if (res) {
        toast({
          title: "Venda não registada",
          description: e instanceof Error ? e.message : "Erro ao registar venda",
          variant: "destructive",
        });
        return;
      }
      // Rede caiu - guardar no aparelho e sincronizar depois.
      // v2.4: o payload já traz localId (v-...) → o servidor reconhece a mesma venda
      // se o pedido online original tiver chegado a ser gravado sem resposta.
      const offlineSale: OfflineSale = {
        ...payload,
        clientCreatedAt: new Date().toISOString(),
      };
      // v2.6 (D8): a escrita pode falhar (Safari privado / memória cheia) -
      // antes a venda perdia-se em silêncio. Agora grita-se na hora.
      const guardada = enqueueSale(offlineSale);
      if (!guardada || storageComProblemas()) {
        setMemoriaCheia(true);
        toast({
          title: "AVISO: venda pode NÃO ter ficado guardada!",
          description: "Memória do aparelho cheia ou modo privado. Ligue a rede e refaça a venda online - não confie nesta cópia offline.",
          variant: "destructive",
          duration: 12000,
        });
      }
      const localSale: SaleFlat = {
        id: offlineSale.localId,
        number: 0,
        userId: user.id,
        user: { name: user.name },
        customer: customer ? { name: customer.name, phone: customer.phone } : null,
        subtotal, discount, total,
        status: "CONCLUIDA",
        isCredit: lines.some((l) => l.method === "CREDITO"),
        priceType,
        commission: 0,
        offline: true,
        clientCreatedAt: offlineSale.clientCreatedAt,
        createdAt: offlineSale.clientCreatedAt,
        items: cart.map((i, idx) => ({ id: `l${idx}`, name: i.name, variantLabel: i.variantLabel, qty: i.qty, unitPrice: i.unitPrice, total: i.unitPrice * i.qty })),
        payments: lines.map((l, idx) => ({ id: `p${idx}`, method: l.method, amount: l.amount, change: l.change ?? 0, reference: l.reference })),
      };
      finishSuccess(localSale, true);
    } finally {
      setSubmitting(false);
    }
  };

  const finishSuccess = async (sale: SaleFlat, wasOffline = false) => {
    setLastSale(sale);
    setReceiptOpen(true);
    setCart([]);
    setCustomer(null);
    setDiscountPct(0);
    setManagerPin(null);
    setPayOpen(false);
    toast({
      title: wasOffline ? "Venda guardada OFFLINE" : `Venda #${String(sale.number).padStart(5, "0")} concluída!`,
      description: wasOffline ? "Será sincronizada automaticamente quando a rede voltar." : "Stock atualizado.",
    });
    if (!wasOffline) {
      reloadCatalog();
      onStockChanged();
      void syncQueue().then((r) => {
        setRecusadas(getRejected()); // v2.6 (D8): refresca o cartão de recusadas
        if (r.synced > 0) onStockChanged();
      });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* ----- Catálogo ----- */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Procurar por nome, código, marca ou tom…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!online && (
          <div className="flex items-center gap-2 text-xs bg-amber-500/10 text-amber-600 rounded-lg px-3 py-2 mb-3">
            <WifiOff className="w-3.5 h-3.5" />
            Modo offline - a vender com catálogo em cache. As vendas ficam guardadas e sincronizam sozinhas.
          </div>
        )}

        {memoriaCheia && (
          <div className="flex items-start gap-2 text-xs bg-destructive/10 text-destructive rounded-lg px-3 py-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span><b>Armazenamento do aparelho com problemas</b> (modo privado? memória cheia?) - as vendas offline podem NÃO ficar guardadas. Prefira vender com rede ligada.</span>
          </div>
        )}

        {/* v2.6 (D8 da auditoria): vendas recusadas pelo servidor - antes
            acumulavam invisíveis; agora o operador vê motivo e pode limpar */}
        {recusadas.length > 0 && (
          <div className="bg-destructive/10 rounded-lg px-3 py-2.5 mb-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold text-destructive">
                <AlertTriangle className="w-3.5 h-3.5" />
                {recusadas.length} venda(s) offline RECUSADA(S) pelo servidor - não entraram no sistema
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => { clearRejected(); setRecusadas([]); toast({ title: "Registo de recusadas limpo", description: "Confirme no papel/WhatsApp se alguma precisa ser refeita." }); }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Limpar registo
              </Button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {recusadas.map((r) => (
                <div key={r.localId} className="text-[11px] text-muted-foreground flex items-center gap-2 bg-background/60 rounded px-2 py-1">
                  <RefreshCw className="w-3 h-3 text-destructive shrink-0" />
                  <span className="font-medium text-foreground">{mt(r.items.reduce((a, i) => a + i.unitPrice * i.qty, 0))}</span>
                  <span>{new Date(r.clientCreatedAt).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="truncate">· {r.reason}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Estas vendas NÃO foram registadas nem baixaram stock. Refaça-as online (verifique stock/fiação) e depois limpe o registo.</p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 overflow-y-auto max-h-[calc(100vh-320px)] lg:max-h-[calc(100vh-250px)] pr-1 content-start">
          {filtered.map((v) => {
            const low = v.stock <= v.minStock;
            const out = v.stock <= 0;
            return (
              <button
                key={v.id}
                onClick={() => addToCart(v)}
                className={`card-lux p-3 text-left hover:ring-2 hover:ring-gold/60 transition-all flex flex-col gap-1 min-h-[110px] ${out ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground line-clamp-1">{v.category}</span>
                  {out ? (
                    <Badge variant="destructive" className="text-[9px] px-1 py-0">Esgotado</Badge>
                  ) : low ? (
                    <Badge className="text-[9px] px-1 py-0 bg-amber-500 hover:bg-amber-500 text-white">{v.stock} un.</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">{v.stock} un.</Badge>
                  )}
                </div>
                <span className="text-sm font-medium leading-tight line-clamp-2">{v.productName}</span>
                {(v.color || v.size) && <span className="text-[11px] text-gold">{variantLabel(v)}</span>}
                <span className="mt-auto text-sm font-bold text-primary">
                  {mt(priceType === "GROSSO" && v.wholesalePrice ? v.wholesalePrice : v.retailPrice)}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
              <PackageOpen className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-sm">Nenhum produto encontrado</p>
            </div>
          )}
        </div>
      </div>

      {/* ----- Carrinho ----- */}
      <div className="w-full lg:w-[380px] shrink-0">
        <div className="card-lux flex flex-col h-full max-h-[calc(100vh-190px)]">
          <div className="p-4 border-b space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-gold" /> Carrinho
                <Badge variant="secondary">{cart.reduce((a, i) => a + i.qty, 0)} un.</Badge>
              </h3>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={doSuspend} disabled={cart.length === 0} title="Suspender venda">
                  <Pause className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Tipo de preço */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted rounded-lg">
              {(["RETALHO", "GROSSO"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setPriceType(t); setCart((prev) => prev.map((i) => { const v = catalog.find((c) => c.id === i.variantId); return v ? { ...i, unitPrice: unitPriceFor(v, i.qty, t) } : i; })); }}
                  className={`py-1.5 rounded-md text-xs font-semibold transition-all ${priceType === t ? "btn-gold shadow" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t === "RETALHO" ? "Retalho" : "Grosso/Revenda"}
                </button>
              ))}
            </div>

            {/* Cliente */}
            <Select
              value={customer?.id ?? "none"}
              onValueChange={(v) => setCustomer(v === "none" ? null : customers.find((c) => c.id === v) ?? null)}
            >
              <SelectTrigger className="w-full">
                <Users className="w-3.5 h-3.5 mr-1 text-gold" />
                <SelectValue placeholder="Cliente (opcional - p/ fiação)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Cliente avulso</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.balance > 0 ? ` - deve ${c.balance.toFixed(0)} MT` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {customer && customer.creditLimit > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Fiação: deve <span className="text-amber-600 font-semibold">{mt(customer.balance)}</span> · limite {mt(customer.creditLimit)}
              </p>
            )}
          </div>

          {/* Itens */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[80px]">
            {cart.map((i) => (
              <div key={i.variantId} className="flex items-center gap-2 bg-muted/60 rounded-lg p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">{i.name}</p>
                  <p className="text-[11px] text-gold">{i.variantLabel}</p>
                  <p className="text-xs text-muted-foreground">{mt(i.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(i.variantId, -1)}>
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-7 text-center text-sm font-bold">{i.qty}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeQty(i.variantId, 1)}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                <button onClick={() => setCart((prev) => prev.filter((x) => x.variantId !== i.variantId))} className="text-destructive/70 hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {cart.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <ShoppingCart className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">Toque nos produtos para vender</p>
              </div>
            )}

            {/* Vendas suspensas */}
            {suspended.length > 0 && (
              <div className="border-t pt-2 mt-2 space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase">Em espera ({suspended.length})</p>
                {suspended.map((s) => (
                  <button key={s.id} onClick={() => doResume(s.id)} className="w-full flex items-center justify-between text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-lg px-2.5 py-2 hover:bg-amber-500/20">
                    <span className="flex items-center gap-1.5 truncate"><Play className="w-3 h-3 shrink-0" /> {s.label} · {s.cart.reduce((a, i) => a + i.qty, 0)} un.</span>
                    <span>Retomar</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Totais */}
          <div className="p-4 border-t space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{mt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                <Percent className="w-3 h-3" /> Desconto
                <button className="text-gold underline text-xs" onClick={() => { setDiscountInput(String(discountPct)); setDiscountDialog(true); }}>
                  {discountPct > 0 ? `editar (${discountPct}%)` : "adicionar"}
                </button>
              </span>
              <span className="text-destructive">-{mt(discount)}</span>
            </div>
            <div className="gold-divider" />
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <span className="text-2xl font-bold text-primary">{mt(total)}</span>
            </div>
            {user.role === "CAIXA" && discountPct > 10 && (
              <p className="text-[10px] text-amber-600">Desconto &gt;10% autorizado pelo gerente ✓</p>
            )}
            <Button className="btn-gold w-full h-12 text-base" disabled={cart.length === 0 || submitting} onClick={() => { setPayKey((k) => k + 1); setPayOpen(true); }}>
              Finalizar Venda
            </Button>
          </div>
        </div>
      </div>

      {/* Diálogos */}
      <PaymentDialog
        key={payKey}
        open={payOpen}
        onOpenChange={setPayOpen}
        total={total}
        priceType={priceType}
        hasCustomer={!!customer}
        customerBalance={customer?.balance ?? 0}
        customerLimit={customer?.creditLimit ?? 0}
        canCredit={!!customer}
        onConfirm={finalize}
        submitting={submitting}
      />
      <ReceiptDialog sale={lastSale} store={store} open={receiptOpen} onOpenChange={setReceiptOpen} />

      <Dialog open={discountDialog} onOpenChange={setDiscountDialog}>
        <DialogContent className="max-w-xs">
          <h3 className="font-semibold flex items-center gap-2"><Percent className="w-4 h-4 text-gold" /> Desconto (%)</h3>
          <Input type="number" inputMode="decimal" autoFocus value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} placeholder="Ex: 5" />
          {user.role !== "GERENTE" && <p className="text-xs text-muted-foreground">Descontos acima de 10% exigem PIN do gerente.</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDiscountDialog(false)}>Cancelar</Button>
            <Button className="btn-gold flex-1" onClick={applyDiscount}>Aplicar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ManagerPinDialog open={pinOpen} onOpenChange={setPinOpen} onSuccess={onPinOk} title="Autorização do Gerente" description="Digite o PIN do gerente para autorizar desconto acima de 10%." />
    </div>
  );
}
