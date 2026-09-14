"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mt, fmtDate, daysUntil, variantLabel, LOSS_REASONS, DEFAULT_PRODUCT_CATEGORIES, DEFAULT_PRODUCT_BRANDS } from "@/lib/format";
import type { ProductVariantFlat, SessionUser } from "@/lib/types";
import {
  Plus, Save, PackagePlus, AlertTriangle, CalendarClock, Trash2, Search, Loader2, X, Tags, Download, Check, Award,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type VariantDraft = {
  id?: string; color: string; size: string; costPrice: string; retailPrice: string;
  wholesalePrice: string; wholesaleMinQty: string; stock: string; minStock: string; expiryDate: string;
};

const emptyVariant = (): VariantDraft => ({
  color: "", size: "", costPrice: "", retailPrice: "", wholesalePrice: "",
  wholesaleMinQty: "3", stock: "0", minStock: "3", expiryDate: "",
});

type HistoryData = {
  entries: Array<{ id: string; qty: number; costPrice: number; supplier: string | null; date: string; product: string; variantLabel: string }>;
  losses: Array<{ id: string; qty: number; reason: string; notes: string | null; date: string; product: string; variantLabel: string }>;
};

export function ProdutosView({ user, catalog, onReload }: { user: SessionUser; catalog: ProductVariantFlat[]; onReload: () => void }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; code: string; name: string; category: string; brand: string } | null>(null);
  const [draft, setDraft] = useState({ code: "", name: "", category: "", brand: "" });
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant()]);
  const [saving, setSaving] = useState(false);

  // Categorias de produtos (lista sugerida + personalizadas, guardadas na BD)
  const [productCats, setProductCats] = useState<string[]>(DEFAULT_PRODUCT_CATEGORIES);
  const [catsOpen, setCatsOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingNewCat, setAddingNewCat] = useState(false); // modo "+ nova" dentro do dialog de produto

  // Marcas (quem fabrica - ex: Zara, Dior) - diferente de categoria; mesma mecânica
  const [productBrands, setProductBrands] = useState<string[]>(DEFAULT_PRODUCT_BRANDS);
  const [brandsOpen, setBrandsOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [addingNewBrand, setAddingNewBrand] = useState(false);

  // Entrada / quebra
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveType, setMoveType] = useState<"ENTRY" | "LOSS">("ENTRY");
  const [moveVariant, setMoveVariant] = useState("");
  const [moveQty, setMoveQty] = useState("");
  const [moveCost, setMoveCost] = useState("");
  const [moveSupplier, setMoveSupplier] = useState("");
  const [moveReason, setMoveReason] = useState("DERRETEU");
  const [moveNotes, setMoveNotes] = useState("");
  const [history, setHistory] = useState<HistoryData>({ entries: [], losses: [] });

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/stock?limit=40");
      if (res.ok) setHistory(await res.json());
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Carrega categorias de produtos guardadas
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.productCategories) && data.productCategories.length > 0) setProductCats(data.productCategories);
        if (Array.isArray(data.productBrands) && data.productBrands.length > 0) setProductBrands(data.productBrands);
      } catch { /* usa predefinidas */ }
    })();
  }, []);

  const persistProductCats = async (list: string[]) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productCategories: list }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro");
      }
      setProductCats(list);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao guardar categorias", variant: "destructive" });
    }
  };

  const addProductCat = (nameRaw?: string) => {
    const name = (nameRaw ?? newCatName).trim();
    if (!name) return;
    if (productCats.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast({ title: "Essa categoria já existe", variant: "destructive" });
      return;
    }
    setNewCatName("");
    void persistProductCats([...productCats, name]);
    return name;
  };

  const removeProductCat = (name: string) => {
    const list = productCats.filter((c) => c !== name);
    if (list.length === 0) return;
    void persistProductCats(list);
    if (draft.category === name) setDraft((d) => ({ ...d, category: "" }));
  };

  const loadSuggestedCats = () => {
    const merged = [...productCats];
    for (const c of DEFAULT_PRODUCT_CATEGORIES) if (!merged.some((x) => x.toLowerCase() === c.toLowerCase())) merged.push(c);
    void persistProductCats(merged);
    toast({ title: "Lista sugerida carregada", description: `${DEFAULT_PRODUCT_CATEGORIES.length} categorias de cosméticos e acessórios disponíveis.` });
  };

  const persistProductBrands = async (list: string[]) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productBrands: list }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro");
      }
      setProductBrands(list);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao guardar marcas", variant: "destructive" });
    }
  };

  const addProductBrand = (nameRaw?: string) => {
    const name = (nameRaw ?? newBrandName).trim();
    if (!name) return;
    if (productBrands.some((b) => b.toLowerCase() === name.toLowerCase())) {
      toast({ title: "Essa marca já existe", variant: "destructive" });
      return;
    }
    setNewBrandName("");
    void persistProductBrands([...productBrands, name]);
    return name;
  };

  const removeProductBrand = (name: string) => {
    const list = productBrands.filter((b) => b !== name);
    if (list.length === 0) return;
    void persistProductBrands(list);
    if (draft.brand === name) setDraft((d) => ({ ...d, brand: "" }));
  };

  const loadSuggestedBrands = () => {
    const merged = [...productBrands];
    for (const b of DEFAULT_PRODUCT_BRANDS) if (!merged.some((x) => x.toLowerCase() === b.toLowerCase())) merged.push(b);
    void persistProductBrands(merged);
    toast({ title: "Lista sugerida carregada", description: `${DEFAULT_PRODUCT_BRANDS.length} marcas de cosméticos e perfumaria disponíveis.` });
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return catalog;
    return catalog.filter((v) =>
      v.productName.toLowerCase().includes(q) || v.productCode.toLowerCase().includes(q) ||
      variantLabel(v).toLowerCase().includes(q) || (v.brand ?? "").toLowerCase().includes(q)
    );
  }, [catalog, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ProductVariantFlat[]>();
    for (const v of filtered) {
      const list = map.get(v.productId) ?? [];
      list.push(v);
      map.set(v.productId, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const openNew = () => {
    setEditing(null);
    setDraft({ code: "", name: "", category: "", brand: "" });
    setVariants([emptyVariant()]);
    setAddingNewCat(false);
    setAddingNewBrand(false);
    setDialogOpen(true);
  };

  const openEdit = async (productId: string) => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error();
      const all: ProductVariantFlat[] = await res.json();
      const vs = all.filter((v) => v.productId === productId);
      if (vs.length === 0) return;
      setEditing({ id: productId, code: vs[0].productCode, name: vs[0].productName, category: vs[0].category, brand: vs[0].brand ?? "" });
      setDraft({ code: vs[0].productCode, name: vs[0].productName, category: vs[0].category, brand: vs[0].brand ?? "" });
      setAddingNewCat(false);
      setAddingNewBrand(false);
      setVariants(vs.map((v) => ({
        id: v.id,
        color: v.color ?? "", size: v.size ?? "",
        costPrice: String(v.costPrice), retailPrice: String(v.retailPrice),
        wholesalePrice: v.wholesalePrice ? String(v.wholesalePrice) : "",
        wholesaleMinQty: String(v.wholesaleMinQty),
        stock: String(v.stock), minStock: String(v.minStock),
        expiryDate: v.expiryDate ? v.expiryDate.slice(0, 10) : "",
      })));
      setDialogOpen(true);
    } catch {
      toast({ title: "Erro ao carregar produto", variant: "destructive" });
    }
  };

  const save = async () => {
    if (!draft.code.trim() || !draft.name.trim()) {
      toast({ title: "Código e nome são obrigatórios", variant: "destructive" });
      return;
    }
    const validVariants = variants.filter((v) => v.color.trim() || v.size.trim() || v.retailPrice);
    if (validVariants.length === 0) {
      toast({ title: "Adicione pelo menos uma variação (cor/tamanho/preço)", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draft,
        variants: validVariants.map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          color: v.color || null, size: v.size || null,
          costPrice: parseFloat(v.costPrice) || 0,
          retailPrice: parseFloat(v.retailPrice) || 0,
          wholesalePrice: v.wholesalePrice ? parseFloat(v.wholesalePrice) : null,
          wholesaleMinQty: parseInt(v.wholesaleMinQty) || 3,
          ...(v.id ? {} : { stock: parseInt(v.stock) || 0 }),
          minStock: parseInt(v.minStock) || 3,
          expiryDate: v.expiryDate || null,
        })),
      };
      const res = editing
        ? await fetch(`/api/products/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro ao guardar");
      }
      toast({ title: editing ? "Produto atualizado" : "Produto criado com sucesso" });
      setDialogOpen(false);
      onReload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const submitMove = async () => {
    const qty = parseInt(moveQty);
    if (!moveVariant || !qty || qty <= 0) {
      toast({ title: "Selecione o produto e a quantidade", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          moveType === "ENTRY"
            ? { type: "ENTRY", variantId: moveVariant, qty, costPrice: parseFloat(moveCost) || 0, supplier: moveSupplier, userId: user.id }
            : { type: "LOSS", variantId: moveVariant, qty, reason: moveReason, notes: moveNotes, userId: user.id }
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro");
      }
      toast({ title: moveType === "ENTRY" ? "Entrada registada - stock atualizado" : "Quebra registada - retirada do stock" });
      setMoveOpen(false);
      setMoveQty(""); setMoveCost(""); setMoveSupplier(""); setMoveNotes("");
      onReload();
      loadHistory();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    }
  };

  const openMove = (type: "ENTRY" | "LOSS", variantId?: string) => {
    setMoveType(type);
    if (variantId) setMoveVariant(variantId);
    setMoveOpen(true);
  };

  const expiring = useMemo(
    () =>
      catalog
        .filter((v) => v.expiryDate)
        .map((v) => ({ ...v, days: daysUntil(v.expiryDate) ?? 999 }))
        .filter((v) => v.days <= 90)
        .sort((a, b) => a.days - b.days),
    [catalog]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Procurar produto…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button className="btn-gold" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> Novo Produto
        </Button>
        <Button variant="outline" onClick={() => openMove("ENTRY")}>
          <PackagePlus className="w-4 h-4 mr-1" /> Entrada de Mercadoria
        </Button>
        <Button variant="outline" onClick={() => setCatsOpen(true)}>
          <Tags className="w-4 h-4 mr-1 text-gold" /> Categorias
        </Button>
        <Button variant="outline" onClick={() => setBrandsOpen(true)}>
          <Award className="w-4 h-4 mr-1 text-gold" /> Marcas
        </Button>
        <Button variant="outline" onClick={() => openMove("LOSS")}>
          <AlertTriangle className="w-4 h-4 mr-1 text-amber-600" /> Registar Quebra
        </Button>
      </div>

      <Tabs defaultValue="todos">
        <TabsList>
          <TabsTrigger value="todos">Produtos ({grouped.length})</TabsTrigger>
          <TabsTrigger value="validade" className="relative">
            Validade
            {expiring.length > 0 && <Badge className="ml-1 bg-amber-500 hover:bg-amber-500 text-white px-1 py-0 text-[10px]">{expiring.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="movimentos">Movimentos</TabsTrigger>
        </TabsList>

        <TabsContent value="todos" className="space-y-3">
          {grouped.map(([productId, vs]) => (
            <div key={productId} className="card-lux overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{vs[0].productName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-gold font-mono">{vs[0].productCode}</span> · {vs[0].category}{vs[0].brand ? ` · ${vs[0].brand}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => openEdit(productId)}>Editar grade</Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variação</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead className="text-right">Retalho</TableHead>
                      <TableHead className="text-right">Grosso</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead>Validade</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vs.map((v) => {
                      const d = daysUntil(v.expiryDate);
                      return (
                        <TableRow key={v.id}>
                          <TableCell className="text-sm">{variantLabel(v) || "-"}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{mt(v.costPrice)}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">{mt(v.retailPrice)}</TableCell>
                          <TableCell className="text-right text-xs">{v.wholesalePrice ? `${mt(v.wholesalePrice)} (${v.wholesaleMinQty}+)` : "-"}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={v.stock <= 0 ? "destructive" : v.stock <= v.minStock ? "secondary" : "outline"}
                              className={v.stock <= v.minStock && v.stock > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40" : ""}>
                              {v.stock} un.
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {v.expiryDate ? (
                              <span className={d !== null && d <= 30 ? "text-destructive font-semibold" : d !== null && d <= 90 ? "text-amber-600" : ""}>
                                {fmtDate(v.expiryDate)}{d !== null && d <= 90 ? ` (${d}d)` : ""}
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openMove("ENTRY", v.id)}>+ Stock</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-700 dark:text-amber-400" onClick={() => openMove("LOSS", v.id)}>Quebra</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
          {grouped.length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">Nenhum produto encontrado.</p>}
        </TabsContent>

        <TabsContent value="validade">
          <div className="card-lux divide-y">
            {expiring.map((v) => (
              <div key={v.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{v.productName} <span className="text-gold text-xs">{variantLabel(v)}</span></p>
                  <p className="text-xs text-muted-foreground">Validade: {fmtDate(v.expiryDate)} · {v.stock} un. em stock</p>
                </div>
                <Badge variant={v.days <= 30 ? "destructive" : "secondary"} className={v.days > 30 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : ""}>
                  {v.days <= 0 ? "EXPIRADO" : `${v.days} dias`}
                </Badge>
              </div>
            ))}
            {expiring.length === 0 && <p className="text-center text-muted-foreground py-12 text-sm">Nenhum produto a expirar nos próximos 90 dias. 🎉</p>}
          </div>
        </TabsContent>

        <TabsContent value="movimentos" className="grid md:grid-cols-2 gap-4">
          <div className="card-lux">
            <h3 className="font-semibold text-sm px-4 py-3 border-b">Últimas entradas</h3>
            <div className="divide-y max-h-96 overflow-y-auto">
              {history.entries.map((e) => (
                <div key={e.id} className="px-4 py-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium truncate">{e.product} <span className="text-gold text-xs">{e.variantLabel}</span></span>
                    <span className="text-green-600 font-semibold">+{e.qty}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(e.date)}{e.supplier ? ` · ${e.supplier}` : ""} · custo {mt(e.costPrice)}</p>
                </div>
              ))}
              {history.entries.length === 0 && <p className="text-center text-muted-foreground py-8 text-xs">Sem entradas registadas.</p>}
            </div>
          </div>
          <div className="card-lux">
            <h3 className="font-semibold text-sm px-4 py-3 border-b">Quebras registadas</h3>
            <div className="divide-y max-h-96 overflow-y-auto">
              {history.losses.map((l) => (
                <div key={l.id} className="px-4 py-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium truncate">{l.product} <span className="text-gold text-xs">{l.variantLabel}</span></span>
                    <span className="text-destructive font-semibold">-{l.qty}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(l.date)} · {LOSS_REASONS.find((r) => r.value === l.reason)?.label ?? l.reason}{l.notes ? ` · ${l.notes}` : ""}
                  </p>
                </div>
              ))}
              {history.losses.length === 0 && <p className="text-center text-muted-foreground py-8 text-xs">Sem quebras registadas.</p>}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ----- Dialog produto + grade ----- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar - ${editing.name}` : "Novo Produto com Grade"}</DialogTitle>
          </DialogHeader>
          {/* ----- Secção: Identificação ----- */}
          <div className="rounded-xl border p-4 space-y-3">
            <p className="text-sm font-semibold text-gold">1. Identificação do produto</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Código *</Label>
                <Input value={draft.code} disabled={!!editing} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="PERF-010" className="font-mono" />
              </div>
              <div className="sm:col-span-3">
                <Label className="text-xs">Nome do produto *</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ex: Perfume X 100ml" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Categoria <span className="text-muted-foreground font-normal">- tipo de produto</span></Label>
                {!addingNewCat ? (
                  <select
                    value={draft.category}
                    onChange={(e) => {
                      if (e.target.value === "__NEW__") { setAddingNewCat(true); setDraft({ ...draft, category: "" }); }
                      else setDraft({ ...draft, category: e.target.value });
                    }}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Sem categoria</option>
                    {productCats.map((c) => <option key={c} value={c}>{c}</option>)}
                    <option value="__NEW__">+ Nova categoria…</option>
                  </select>
                ) : (
                  <div className="flex gap-1.5">
                    <Input
                      autoFocus
                      value={draft.category}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const name = draft.category.trim();
                          if (name && !productCats.includes(name)) addProductCat(name);
                          setAddingNewCat(false);
                        }
                      }}
                      placeholder="Ex: Perfumes (Dama)"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        const name = draft.category.trim();
                        if (name && !productCats.includes(name)) addProductCat(name);
                        setAddingNewCat(false);
                      }}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs">Marca <span className="text-muted-foreground font-normal">- quem fabrica (Zara, Dior…)</span></Label>
                {!addingNewBrand ? (
                  <select
                    value={draft.brand}
                    onChange={(e) => {
                      if (e.target.value === "__NEW_BRAND__") { setAddingNewBrand(true); setDraft({ ...draft, brand: "" }); }
                      else setDraft({ ...draft, brand: e.target.value });
                    }}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Sem marca</option>
                    {productBrands.map((b) => <option key={b} value={b}>{b}</option>)}
                    <option value="__NEW_BRAND__">+ Nova marca…</option>
                  </select>
                ) : (
                  <div className="flex gap-1.5">
                    <Input
                      autoFocus
                      value={draft.brand}
                      onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const name = draft.brand.trim();
                          if (name && !productBrands.includes(name)) addProductBrand(name);
                          setAddingNewBrand(false);
                        }
                      }}
                      placeholder="Ex: Zara"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => {
                        const name = draft.brand.trim();
                        if (name && !productBrands.includes(name)) addProductBrand(name);
                        setAddingNewBrand(false);
                      }}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ----- Secção: Variações ----- */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gold">2. Variações <span className="text-muted-foreground font-normal">- preços e stock de cada cor/tamanho</span></p>
              <Button size="sm" variant="outline" onClick={() => setVariants([...variants, emptyVariant()])}>
                <Plus className="w-3 h-3 mr-1" /> Variação
              </Button>
            </div>
            {variants.map((v, idx) => (
              <div key={idx} className="relative rounded-lg border bg-muted/30 p-3 space-y-2">
                {!editing && variants.length > 1 && (
                  <button className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5" onClick={() => setVariants(variants.filter((_, i) => i !== idx))}>
                    <X className="w-3 h-3" />
                  </button>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Cor / Tom</Label>
                    <Input placeholder="Ex: Tom 220" value={v.color} onChange={(e) => setVariants(variants.map((x, i) => (i === idx ? { ...x, color: e.target.value } : x)))} />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Tamanho</Label>
                    <Input placeholder="Ex: 30ml" value={v.size} onChange={(e) => setVariants(variants.map((x, i) => (i === idx ? { ...x, size: e.target.value } : x)))} />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Validade <span className="text-gold">(opcional)</span></Label>
                    <Input type="date" value={v.expiryDate} onChange={(e) => setVariants(variants.map((x, i) => (i === idx ? { ...x, expiryDate: e.target.value } : x)))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Custo (MT)</Label>
                    <Input type="number" placeholder="0" value={v.costPrice} onChange={(e) => setVariants(variants.map((x, i) => (i === idx ? { ...x, costPrice: e.target.value } : x)))} />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Preço retalho (MT) *</Label>
                    <Input type="number" placeholder="0" value={v.retailPrice} onChange={(e) => setVariants(variants.map((x, i) => (i === idx ? { ...x, retailPrice: e.target.value } : x)))} />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Preço grosso (MT)</Label>
                    <Input type="number" placeholder="opcional" value={v.wholesalePrice} onChange={(e) => setVariants(variants.map((x, i) => (i === idx ? { ...x, wholesalePrice: e.target.value } : x)))} />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Qtd. mín. grosso</Label>
                    <Input type="number" placeholder="3" value={v.wholesaleMinQty} onChange={(e) => setVariants(variants.map((x, i) => (i === idx ? { ...x, wholesaleMinQty: e.target.value } : x)))} />
                  </div>
                </div>
                {!editing && (
                  <div className="grid grid-cols-2 gap-2 sm:max-w-[50%]">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Stock inicial</Label>
                      <Input type="number" placeholder="0" value={v.stock} onChange={(e) => setVariants(variants.map((x, i) => (i === idx ? { ...x, stock: e.target.value } : x)))} />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Alerta stock mínimo</Label>
                      <Input type="number" placeholder="3" value={v.minStock} onChange={(e) => setVariants(variants.map((x, i) => (i === idx ? { ...x, minStock: e.target.value } : x)))} />
                    </div>
                  </div>
                )}
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              O mesmo código base partilha variações - cada cor/tamanho tem stock próprio. A <b>validade é opcional</b>: preencha apenas em produtos com prazo (cremes, cosméticos) para receber alertas no painel (30/60/90 dias).
            </p>
          </div>

          <Button className="btn-gold w-full h-11" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> {editing ? "Guardar Alterações" : "Criar Produto"}</>}
          </Button>
        </DialogContent>
      </Dialog>

      {/* ----- Dialog gestor de categorias ----- */}
      <Dialog open={catsOpen} onOpenChange={setCatsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Tags className="w-4 h-4 text-gold" /> Categorias de Produtos</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button variant="outline" className="w-full" onClick={loadSuggestedCats}>
              <Download className="w-4 h-4 mr-1" /> Carregar lista sugerida (cosméticos & acessórios)
            </Button>
            <div className="flex gap-2">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProductCat(); } }}
                placeholder="Nova categoria personalizada…"
              />
              <Button className="btn-gold shrink-0" onClick={() => addProductCat()} disabled={!newCatName.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {productCats.map((c) => (
                <div key={c} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm">{c}</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive p-1" title="Remover" onClick={() => removeProductCat(c)}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              A lista sugerida cobre perfumes, cabelo, maquilhagem, unhas, corporal, bebé, barbearia e acessórios. As alterações são guardadas automaticamente.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ----- Dialog gestor de marcas ----- */}
      <Dialog open={brandsOpen} onOpenChange={setBrandsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Award className="w-4 h-4 text-gold" /> Marcas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button variant="outline" className="w-full" onClick={loadSuggestedBrands}>
              <Download className="w-4 h-4 mr-1" /> Carregar lista sugerida de marcas
            </Button>
            <div className="flex gap-2">
              <Input
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProductBrand(); } }}
                placeholder="Nova marca personalizada…"
              />
              <Button className="btn-gold shrink-0" onClick={() => addProductBrand()} disabled={!newBrandName.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {productBrands.map((b) => (
                <div key={b} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm">{b}</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive p-1" title="Remover" onClick={() => removeProductBrand(b)}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              A marca é quem fabrica o produto (Zara, Dior, Nivea…) - diferente da categoria, que é o tipo de produto (Perfumes, Cremes…). As alterações são guardadas automaticamente.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ----- Dialog entrada/quebra ----- */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {moveType === "ENTRY" ? <><PackagePlus className="w-4 h-4 text-green-600" /> Entrada de Mercadoria</> : <><AlertTriangle className="w-4 h-4 text-amber-600" /> Registar Quebra</>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Produto / Variação *</Label>
              <Select value={moveVariant} onValueChange={setMoveVariant}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {catalog.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.productName} {variantLabel(v) ? `(${variantLabel(v)})` : ""} - {v.stock} un.
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Quantidade *</Label>
              <Input type="number" min="1" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} />
            </div>
            {moveType === "ENTRY" ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Custo unitário (MT)</Label>
                  <Input type="number" value={moveCost} onChange={(e) => setMoveCost(e.target.value)} placeholder="380" />
                </div>
                <div>
                  <Label className="text-xs">Fornecedor</Label>
                  <Input value={moveSupplier} onChange={(e) => setMoveSupplier(e.target.value)} placeholder="Mukherista / Baixa / Maputo" />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Motivo *</Label>
                  <Select value={moveReason} onValueChange={setMoveReason}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LOSS_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Observações</Label>
                  <Input value={moveNotes} onChange={(e) => setMoveNotes(e.target.value)} placeholder="Ex: derreteu no calor do armário" />
                </div>
                <p className="text-[11px] text-muted-foreground">A quebra sai do stock e NÃO conta como venda.</p>
              </div>
            )}
            <Button className="btn-gold w-full" onClick={submitMove}>
              <CalendarClock className="w-4 h-4 mr-1" />
              {moveType === "ENTRY" ? "Registar Entrada" : "Registar Quebra"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
