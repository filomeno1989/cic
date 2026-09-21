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
import { mt, fmtDate, daysUntil, variantLabel, LOSS_REASONS, DEFAULT_PRODUCT_CATEGORIES, DEFAULT_PRODUCT_BRANDS } from "@/lib/format";
import type { ProductVariantFlat, SessionUser } from "@/lib/types";
import {
  Plus, Save, PackagePlus, AlertTriangle, CalendarClock, Trash2, Search, Loader2, X, Tags, Download, Check, Award, Image as ImageIcon,
  Archive, ArchiveRestore, SlidersHorizontal, RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchT } from "@/lib/http";
import { ficheiroParaJpeg, type ImagemPayload } from "@/lib/imagem";

type VariantDraft = {
  id?: string; color: string; size: string; costPrice: string; retailPrice: string;
  wholesalePrice: string; wholesaleMinQty: string; stock: string; minStock: string; expiryDate: string;
  removed?: boolean; // v2.4: variante existente marcada p/ arquivar (active=false ao gravar)
};

const emptyVariant = (): VariantDraft => ({
  color: "", size: "", costPrice: "", retailPrice: "", wholesalePrice: "",
  wholesaleMinQty: "3", stock: "0", minStock: "3", expiryDate: "",
});

type HistoryData = {
  entries: Array<{ id: string; qty: number; costPrice: number; supplier: string | null; date: string; product: string; variantLabel: string }>;
  losses: Array<{ id: string; qty: number; reason: string; notes: string | null; date: string; product: string; variantLabel: string }>;
  suppliers?: Array<{ name: string; entries: number; units: number; totalCost: number; lastDate: string }>;
};

export function ProdutosView({ user, catalog, onReload }: { user: SessionUser; catalog: ProductVariantFlat[]; onReload: () => void }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; code: string; name: string; category: string; brand: string } | null>(null);
  const [draft, setDraft] = useState({ code: "", name: "", category: "", brand: "" });
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant()]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // trava duplo-clique no MESMO tick

  // P2: foto do produto (guardada no Supabase, mostrada no catálogo e no portal)
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [imgPayload, setImgPayload] = useState<ImagemPayload | null>(null);
  const [imgRemoved, setImgRemoved] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // P2: sugestão automática de código livre (ex: "CART" → "CART 05")
  const [sugestao, setSugestao] = useState<string | null>(null);
  const [sugLoading, setSugLoading] = useState(false);

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

  // Entrada / quebra / ajuste (v2.4)
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveType, setMoveType] = useState<"ENTRY" | "LOSS" | "AJUSTE">("ENTRY");
  const [moveVariant, setMoveVariant] = useState("");
  const [moveQty, setMoveQty] = useState("");
  const [moveCost, setMoveCost] = useState("");
  const [moveSupplier, setMoveSupplier] = useState("");
  const [moveReason, setMoveReason] = useState("DERRETEU");
  const [moveNotes, setMoveNotes] = useState("");
  const [moveContagem, setMoveContagem] = useState(""); // v2.4: contagem real p/ ajuste
  const [moveSaving, setMoveSaving] = useState(false);
  const moveSavingRef = useRef(false); // trava duplo-clique (causa real do stock duplicado)
  const [history, setHistory] = useState<HistoryData>({ entries: [], losses: [] });

  // v2.4: gestão de arquivados - ver produtos arquivados e arquivar/restaurar/eliminar
  const [verArquivados, setVerArquivados] = useState(false);
  const [catalogoArquivados, setCatalogoArquivados] = useState<ProductVariantFlat[]>([]);
  const [busyProduct, setBusyProduct] = useState<string | null>(null); // trava duplo-clique nos botões de gestão

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetchT("/api/stock?limit=40");
      if (res.ok) setHistory(await res.json());
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // v2.4: carrega o catálogo INCLUINDO arquivados quando o utilizador pede para vê-los
  const loadArquivados = useCallback(async () => {
    try {
      const res = await fetchT("/api/products?arquivados=1");
      if (res.ok) setCatalogoArquivados(await res.json());
    } catch { /* mantém lista anterior */ }
  }, []);

  useEffect(() => {
    if (verArquivados) void loadArquivados();
  }, [verArquivados, loadArquivados]);

  // Catálogo em uso: o normal (ativo) ou o completo com arquivados
  const lista = verArquivados ? catalogoArquivados : catalog;

  // v2.4: arquivar / restaurar / eliminar definitivamente (padrão dos Clientes)
  const setProductArchived = async (productId: string, nome: string, active: boolean) => {
    if (busyProduct) return;
    setBusyProduct(productId);
    try {
      const res = await fetchT(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erro");
      toast({ title: active ? "Produto restaurado" : "Produto arquivado", description: nome });
      await loadArquivados();
      onReload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setBusyProduct(null);
    }
  };

  const eliminarProduto = async (productId: string, nome: string) => {
    if (busyProduct) return;
    if (!confirm(`Eliminar DEFINITIVAMENTE «${nome}»?\n\nSó é possível se o produto NUNCA teve vendas nem movimentos de stock. Caso contrário, use «Arquivar».`)) return;
    setBusyProduct(productId);
    try {
      const res = await fetchT(`/api/products/${productId}?modo=definitivo`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erro ao eliminar");
      toast({ title: "Produto eliminado para sempre", description: nome });
      await loadArquivados();
      onReload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao eliminar", variant: "destructive" });
    } finally {
      setBusyProduct(null);
    }
  };

  // Carrega categorias de produtos guardadas
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchT("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.productCategories) && data.productCategories.length > 0) setProductCats(data.productCategories);
        if (Array.isArray(data.productBrands) && data.productBrands.length > 0) setProductBrands(data.productBrands);
      } catch { /* usa predefinidas */ }
    })();
  }, []);

  const persistProductCats = async (list: string[]) => {
    try {
      const res = await fetchT("/api/settings", {
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
      const res = await fetchT("/api/settings", {
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
    if (!q) return lista;
    return lista.filter((v) =>
      v.productName.toLowerCase().includes(q) || v.productCode.toLowerCase().includes(q) ||
      variantLabel(v).toLowerCase().includes(q) || (v.brand ?? "").toLowerCase().includes(q)
    );
  }, [lista, search]);

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
    setImgPreview(null); setImgPayload(null); setImgRemoved(false);
    setSugestao(null);
    setDialogOpen(true);
  };

  const openEdit = async (productId: string) => {
    try {
      const res = await fetchT("/api/products?arquivados=1");
      if (!res.ok) throw new Error();
      const all: ProductVariantFlat[] = await res.json();
      const vs = all.filter((v) => v.productId === productId); // arquivados=1: traz também variantes desligadas
      if (vs.length === 0) return;
      setEditing({ id: productId, code: vs[0].productCode, name: vs[0].productName, category: vs[0].category, brand: vs[0].brand ?? "" });
      setDraft({ code: vs[0].productCode, name: vs[0].productName, category: vs[0].category, brand: vs[0].brand ?? "" });
      setAddingNewCat(false);
      setAddingNewBrand(false);
      setImgPreview(vs[0].imagem ?? null); setImgPayload(null); setImgRemoved(false);
      setSugestao(null);
      setVariants(vs.map((v) => ({
        id: v.id,
        color: v.color ?? "", size: v.size ?? "",
        costPrice: String(v.costPrice), retailPrice: String(v.retailPrice),
        wholesalePrice: v.wholesalePrice ? String(v.wholesalePrice) : "",
        wholesaleMinQty: String(v.wholesaleMinQty),
        stock: String(v.stock), minStock: String(v.minStock),
        expiryDate: v.expiryDate ? v.expiryDate.slice(0, 10) : "",
        removed: !v.active, // v2.4: variante arquivada vem desligada (pode reativar)
      })));
      setDialogOpen(true);
    } catch {
      toast({ title: "Erro ao carregar produto", variant: "destructive" });
    }
  };

  // Códigos já usados - para avisar ANTES de tentar gravar
  const usedCodes = useMemo(() => new Set(catalog.map((v) => v.productCode.toUpperCase())), [catalog]);
  const codeTaken = !editing && !!draft.code.trim() && usedCodes.has(draft.code.trim().toUpperCase());

  // P2: mostra a sugestão apenas quando ajuda (prefixo sem número, ou código ocupado)
  const typedHasDigits = /\d/.test(draft.code.trim());
  const showSug = !editing && !!sugestao && sugestao.toUpperCase() !== draft.code.trim().toUpperCase() && (!typedHasDigits || codeTaken);

  // P2: pergunta ao servidor o próximo código livre p/ o prefixo digitado
  useEffect(() => {
    if (editing) { setSugestao(null); return; }
    const code = draft.code.trim();
    if (code.length < 2 || !/[a-zA-Z]/.test(code)) { setSugestao(null); return; }
    setSugLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetchT(`/api/products/codigo-sugestao?prefixo=${encodeURIComponent(code)}`);
        const data = await res.json().catch(() => ({}));
        setSugestao(typeof data.sugestao === "string" ? data.sugestao : null);
      } catch { setSugestao(null); }
      finally { setSugLoading(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [draft.code, editing]);

  // P2: foto escolhida no aparelho → comprime (máx 1000px JPEG) e fica em pré-visualização
  const onPickImagem = async (f: File | null) => {
    if (!f) return;
    try {
      const payload = await ficheiroParaJpeg(f);
      setImgPayload(payload);
      setImgPreview(`data:${payload.mime};base64,${payload.data}`);
      setImgRemoved(false);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro ao processar a imagem", variant: "destructive" });
    }
  };

  const onRemoveImagem = () => {
    setImgPayload(null);
    setImgPreview(null);
    setImgRemoved(true);
  };

  const save = async () => {
    if (savingRef.current) return; // já está a gravar
    if (!draft.code.trim() || !draft.name.trim()) {
      toast({ title: "Código e nome são obrigatórios", variant: "destructive" });
      return;
    }
    const validVariants = variants.filter((v) => !v.removed && (v.color.trim() || v.size.trim() || v.retailPrice));
    if (!editing && validVariants.length === 0) {
      toast({ title: "Adicione pelo menos uma variação (cor/tamanho/preço)", variant: "destructive" });
      return;
    }
    if (editing && validVariants.length === 0 && !variants.some((v) => v.id)) {
      toast({ title: "Adicione pelo menos uma variação (cor/tamanho/preço)", variant: "destructive" });
      return;
    }
    // v2.4: variações existentes arquivadas vão no payload como active:false
    // (nunca apagadas a sério - preservam o histórico de vendas)
    const removidasExistentes = variants
      .filter((v) => v.removed && v.id)
      .map((v) => ({ id: v.id as string, active: false }));
    setSaving(true);
    savingRef.current = true;
    try {
      const payload = {
        ...draft,
        variants: [
          ...validVariants.map((v) => ({
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
          ...removidasExistentes,
        ],
      };
      const res = editing
        ? await fetchT(`/api/products/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetchT("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro ao guardar");
      }
      // P2: gravado! Agora envia/remove a foto (falha da foto não desfaz o produto)
      const saved = editing ? null : await res.json().catch(() => null);
      const pid = editing ? editing.id : (saved as { id?: string } | null)?.id;
      if (pid) {
        if (imgPayload) {
          try {
            const r2 = await fetchT(`/api/products/${pid}/imagem`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(imgPayload),
            });
            if (!r2.ok) throw new Error();
          } catch {
            toast({ title: "Produto gravado, mas a foto não foi guardada", description: "Edite o produto e envie a foto de novo.", variant: "destructive" });
          }
        } else if (imgRemoved) {
          try { await fetchT(`/api/products/${pid}/imagem`, { method: "DELETE" }); } catch { /* silencioso */ }
        }
      }
      toast({ title: editing ? "Produto atualizado" : "Produto criado com sucesso" });
      setDialogOpen(false);
      onReload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro de rede - verifique a internet e tente de novo", variant: "destructive" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const submitMove = async () => {
    if (moveSavingRef.current) return; // DUPLO-CLIQUE BLOQUEADO (era a causa do stock duplicado)
    const qty = parseInt(moveQty);
    if (!moveVariant) {
      toast({ title: "Selecione o produto", variant: "destructive" });
      return;
    }
    if (moveType !== "AJUSTE" && (!qty || qty <= 0)) {
      toast({ title: "Selecione a quantidade", variant: "destructive" });
      return;
    }
    if (moveType === "AJUSTE" && (moveContagem.trim() === "" || isNaN(parseInt(moveContagem)) || parseInt(moveContagem) < 0)) {
      toast({ title: "Indique a contagem real (0 ou mais)", variant: "destructive" });
      return;
    }
    setMoveSaving(true);
    moveSavingRef.current = true;
    try {
      const res = await fetchT("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          moveType === "ENTRY"
            ? { type: "ENTRY", variantId: moveVariant, qty, costPrice: parseFloat(moveCost) || 0, supplier: moveSupplier.trim(), userId: user.id }
            : moveType === "LOSS"
              ? { type: "LOSS", variantId: moveVariant, qty, reason: moveReason, notes: moveNotes, userId: user.id }
              : { type: "AJUSTE", variantId: moveVariant, novoStock: parseInt(moveContagem), notes: moveNotes, userId: user.id }
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro");
      }
      toast({
        title:
          moveType === "ENTRY" ? "Entrada registada - stock atualizado"
          : moveType === "LOSS" ? "Quebra registada - retirada do stock"
          : "Stock ajustado à contagem real",
      });
      setMoveOpen(false);
      setMoveQty(""); setMoveCost(""); setMoveSupplier(""); setMoveNotes(""); setMoveContagem("");
      onReload();
      loadHistory();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro de rede - verifique a internet", variant: "destructive" });
    } finally {
      moveSavingRef.current = false;
      setMoveSaving(false);
    }
  };

  const openMove = (type: "ENTRY" | "LOSS" | "AJUSTE", variantId?: string) => {
    setMoveType(type);
    if (variantId) setMoveVariant(variantId);
    setMoveContagem("");
    setMoveOpen(true);
  };

  // v2.4: stock atual da variação escolhida no diálogo de movimentos + diferença do ajuste
  const moveVariantAtual = lista.find((v) => v.id === moveVariant) ?? null;
  const ajusteDelta =
    moveType === "AJUSTE" && moveContagem.trim() !== "" && !isNaN(parseInt(moveContagem)) && moveVariantAtual
      ? parseInt(moveContagem) - moveVariantAtual.stock
      : null;

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
        <Button
          variant={verArquivados ? "secondary" : "outline"}
          className={verArquivados ? "" : "text-muted-foreground"}
          onClick={() => setVerArquivados((v) => !v)}
        >
          <Archive className="w-4 h-4 mr-1" /> {verArquivados ? "A ver arquivados" : "Ver arquivados"}
        </Button>
      </div>

      {verArquivados && (
        <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">
          A mostrar também produtos <b>arquivados</b> (e variações desligadas). Produtos arquivados não aparecem no PDV nem no portal do cliente - restaure para voltar a vender.
        </p>
      )}

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
          {grouped.map(([productId, vs]) => {
            const produtoArquivado = vs[0].productActive === false; // v2.4
            return (
            <div key={productId} className={`card-lux overflow-hidden ${produtoArquivado ? "opacity-70" : ""}`}>
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {vs[0].imagem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={vs[0].imagem} alt={vs[0].productName} className="w-10 h-10 rounded-lg object-cover border border-gold/30 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4 text-gold/50" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                      {vs[0].productName}
                      {produtoArquivado && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">ARQUIVADO</Badge>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      <span className="text-gold font-mono">{vs[0].productCode}</span> · {vs[0].category}{vs[0].brand ? ` · ${vs[0].brand}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {produtoArquivado ? (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyProduct === productId} onClick={() => setProductArchived(productId, vs[0].productName, true)}>
                        <ArchiveRestore className="w-3.5 h-3.5 mr-1" /> Restaurar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" disabled={busyProduct === productId} onClick={() => eliminarProduto(productId, vs[0].productName)} title="Eliminar definitivamente (só sem histórico)">
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={busyProduct === productId} onClick={() => setProductArchived(productId, vs[0].productName, false)} title="Retira do PDV e do portal, mantendo o histórico">
                      <Archive className="w-3.5 h-3.5 mr-1" /> Arquivar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(productId)}>Editar grade</Button>
                </div>
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
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-gold" title="Corrigir para a contagem real (reduz ou aumenta)" onClick={() => openMove("AJUSTE", v.id)}>
                                <SlidersHorizontal className="w-3 h-3 mr-1" /> Ajustar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            );
          })}
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
          <div className="card-lux md:col-span-2">
            <h3 className="font-semibold text-sm px-4 py-3 border-b">Fornecedores <span className="text-muted-foreground font-normal">- total comprado por fornecedor</span></h3>
            <div className="divide-y max-h-96 overflow-y-auto">
              {(history.suppliers ?? []).map((s) => (
                <div key={s.name} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground">{s.entries} entrada{s.entries > 1 ? "s" : ""} · {s.units} un. · última {fmtDate(s.lastDate)}</p>
                  </div>
                  <span className="text-gold font-semibold text-sm whitespace-nowrap">{mt(s.totalCost)}</span>
                </div>
              ))}
              {(history.suppliers ?? []).length === 0 && (
                <p className="text-center text-muted-foreground py-8 text-xs">
                  Nenhum fornecedor ainda - o nome gravado na Entrada de Mercadoria aparece aqui automaticamente.
                </p>
              )}
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
                {codeTaken && <p className="text-[11px] text-destructive mt-1">Este código já existe - use outro (ex: acrescente 02, 03…)</p>}
                {showSug && sugestao && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, code: sugestao })}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/40 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                  >
                    <Check className="w-3 h-3" /> Livre: <b>{sugestao}</b>&nbsp;— tocar para usar
                  </button>
                )}
                {sugLoading && !showSug && <p className="text-[10px] text-muted-foreground mt-1">a procurar código livre…</p>}
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

            {/* P2: foto do produto - comprimida no aparelho, guardada no Supabase */}
            <div className="flex items-center gap-3 pt-1">
              {imgPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgPreview} alt="Foto do produto" className="w-16 h-16 rounded-lg object-cover border border-gold/40" />
              ) : (
                <div className="w-16 h-16 rounded-lg border border-dashed border-gold/40 bg-accent/50 flex items-center justify-center">
                  <ImageIcon className="w-5 h-5 text-gold/60" />
                </div>
              )}
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Foto do produto <span className="text-muted-foreground font-normal">- aparece no catálogo e no portal do cliente /loja</span></p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => imgInputRef.current?.click()}>
                    <ImageIcon className="w-3.5 h-3.5 mr-1" /> {imgPreview ? "Trocar foto" : "Escolher foto"}
                  </Button>
                  {imgPreview && (
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={onRemoveImagem}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Remover
                    </Button>
                  )}
                </div>
                <input
                  ref={imgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { onPickImagem(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }}
                />
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
              <div key={idx} className={`relative rounded-lg border p-3 space-y-2 ${v.removed ? "border-dashed opacity-60" : "bg-muted/30"}`}>
                {/* v2.4: X em NOVAS remove a linha; X em EXISTENTES arquiva ao gravar (preserva histórico) */}
                {!editing && variants.length > 1 && (
                  <button className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5" title="Remover linha" onClick={() => setVariants(variants.filter((_, i) => i !== idx))}>
                    <X className="w-3 h-3" />
                  </button>
                )}
                {editing && v.id && !v.removed && (
                  <button
                    className="absolute -top-2 -right-2 bg-amber-600 text-white rounded-full p-0.5"
                    title="Arquivar esta variação (sai do PDV; histórico de vendas fica intacto)"
                    onClick={() => setVariants(variants.map((x, i) => (i === idx ? { ...x, removed: true } : x)))}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                {v.removed && (
                  <div className="flex items-center justify-between rounded-md bg-amber-500/10 border border-amber-500/40 px-2.5 py-1.5">
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">Esta variação será ARQUIVADA ao gravar (o histórico de vendas fica intacto).</p>
                    <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px] text-amber-700 dark:text-amber-400" onClick={() => setVariants(variants.map((x, i) => (i === idx ? { ...x, removed: false } : x)))}>
                      <RotateCcw className="w-3 h-3 mr-1" /> Reativar
                    </Button>
                  </div>
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

      {/* ----- Dialog entrada/quebra/ajuste ----- */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {moveType === "ENTRY" ? <><PackagePlus className="w-4 h-4 text-green-600" /> Entrada de Mercadoria</>
                : moveType === "LOSS" ? <><AlertTriangle className="w-4 h-4 text-amber-600" /> Registar Quebra</>
                : <><SlidersHorizontal className="w-4 h-4 text-gold" /> Ajustar Stock (Contagem)</>}
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
            {moveType !== "AJUSTE" && (
              <div>
                <Label className="text-xs">Quantidade *</Label>
                <Input type="number" min="1" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} />
              </div>
            )}
            {moveType === "ENTRY" ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Custo unitário (MT)</Label>
                  <Input type="number" value={moveCost} onChange={(e) => setMoveCost(e.target.value)} placeholder="380" />
                </div>
                <div>
                  <Label className="text-xs">Fornecedor</Label>
                  <Input value={moveSupplier} onChange={(e) => setMoveSupplier(e.target.value)} placeholder="Mukherista / Baixa / Maputo" list="lista-fornecedores" />
                  <datalist id="lista-fornecedores">
                    {(history.suppliers ?? []).map((s) => <option key={s.name} value={s.name} />)}
                  </datalist>
                </div>
              </div>
            ) : moveType === "LOSS" ? (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Motivo *</Label>
                  <Select value={moveReason} onValueChange={setMoveReason}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LOSS_REASONS.filter((r) => r.value !== "AJUSTE").map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Observações</Label>
                  <Input value={moveNotes} onChange={(e) => setMoveNotes(e.target.value)} placeholder="Ex: derreteu no calor do armário" />
                </div>
                <p className="text-[11px] text-muted-foreground">A quebra sai do stock e NÃO conta como venda.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-lg bg-muted px-3 py-2 text-xs">
                  Stock atual no sistema: <b>{moveVariantAtual ? `${moveVariantAtual.stock} un.` : "-"}</b>
                </div>
                <div>
                  <Label className="text-xs">Contagem real (stock correto) *</Label>
                  <Input type="number" min="0" value={moveContagem} onChange={(e) => setMoveContagem(e.target.value)} placeholder="Ex: 24" autoFocus />
                </div>
                {ajusteDelta !== null && ajusteDelta !== 0 && (
                  <p className={`text-xs font-medium ${ajusteDelta > 0 ? "text-green-600" : "text-amber-700 dark:text-amber-400"}`}>
                    {ajusteDelta > 0
                      ? `Vai ADICIONAR ${ajusteDelta} un. (mercadoria encontrada na contagem)`
                      : `Vai REDUZIR ${Math.abs(ajusteDelta)} un. (sobra no sistema)`}
                  </p>
                )}
                {ajusteDelta === 0 && (
                  <p className="text-xs text-muted-foreground">A contagem é igual ao stock atual - nada a corrigir.</p>
                )}
                <div>
                  <Label className="text-xs">Observações</Label>
                  <Input value={moveNotes} onChange={(e) => setMoveNotes(e.target.value)} placeholder="Ex: contagem do armário de setembro" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Corrige o stock para o valor REAL contado. A diferença fica registada no histórico (a menos entra como «Ajuste de contagem») e NÃO conta como venda.
                </p>
              </div>
            )}
            <Button className="btn-gold w-full" onClick={submitMove} disabled={moveSaving}>
              {moveSaving
                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                : <CalendarClock className="w-4 h-4 mr-1" />}
              {moveSaving ? "A registar…" : moveType === "ENTRY" ? "Registar Entrada" : moveType === "LOSS" ? "Registar Quebra" : "Aplicar Ajuste"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
