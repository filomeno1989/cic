"use client";

// ============================================================
// P2 - PORTAL DO CLIENTE /loja (público, sem login)
// Catálogo com fotos, preços retalho e disponibilidade.
// Acesso por QR (impresso no balcão) ou por LINK com mensagem
// bonita: /loja?msg=Bem-vinda%20ao%20nosso%20catálogo...
// Encomenda via WhatsApp da loja (definido em Definições).
// ============================================================
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, MessageCircle, PackageX, Sparkles, Phone, MapPin, Store, Bike } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mt, waNumber } from "@/lib/format";
import { fetchT } from "@/lib/http";
import { APP_SIGNATURE, APP_SIGNATURE_FULL } from "@/lib/version";

type CatalogoItem = {
  id: string; productId: string; nome: string; codigo: string;
  categoria: string; marca: string | null; cor: string | null; tamanho: string | null;
  preco: number; disponivel: boolean; imagem: string | null;
};
type LojaConfig = { storeName: string; address: string; phone: string; whatsappLoja: string; receiptFooter: string };

const iniciais = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "CIC";

const variante = (v: CatalogoItem) => [v.cor, v.tamanho].filter(Boolean).join(" · ");

function PortalLoja() {
  const searchParams = useSearchParams();
  const msg = searchParams.get("msg")?.slice(0, 240) ?? "";

  const [itens, setItens] = useState<CatalogoItem[]>([]);
  const [config, setConfig] = useState<LojaConfig | null>(null);
  const [estado, setEstado] = useState<"carrega" | "ok" | "erro">("carrega");
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("Todos");
  const [selecionado, setSelecionado] = useState<CatalogoItem | null>(null);
  // Entrega: o cliente escolhe levantar na loja ou receber em casa -
  // a escolha vai na mensagem do WhatsApp e a loja combina os detalhes no chat.
  const [entrega, setEntrega] = useState<"levantar" | "casa">("levantar");

  const carregar = async () => {
    setEstado("carrega");
    try {
      const [rc, ri] = await Promise.all([fetchT("/api/loja/config"), fetchT("/api/loja/catalogo")]);
      if (!rc.ok || !ri.ok) throw new Error();
      setConfig(await rc.json());
      setItens(await ri.json());
      setEstado("ok");
    } catch {
      setEstado("erro");
    }
  };
  useEffect(() => { carregar(); }, []);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const i of itens) if (i.categoria) set.add(i.categoria);
    return ["Todos", ...[...set].sort((a, b) => a.localeCompare(b, "pt"))];
  }, [itens]);

  const visiveis = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return itens.filter((i) => {
      if (cat !== "Todos" && i.categoria !== cat) return false;
      if (!q) return true;
      return [i.nome, i.marca, i.codigo, i.cor, i.tamanho].filter(Boolean).some((x) => String(x).toLowerCase().includes(q));
    });
  }, [itens, busca, cat]);

  const encomendar = (item: CatalogoItem) => {
    if (!config?.whatsappLoja) return null;
    const n = waNumber(config.whatsappLoja);
    if (!n) return null;
    const v = variante(item) ? ` (${variante(item)})` : "";
    const como = entrega === "casa"
      ? "Gostaria de encomendar com entrega em casa, por favor."
      : "Gostaria de encomendar para levantar na loja, por favor.";
    const texto = `Olá! Vi no catálogo da ${config.storeName}: ${item.nome}${v} — ${mt(item.preco)}. ${como}`;
    return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
  };

  return (
    <div className="min-h-screen bg-[#faf8f3] text-neutral-900">
      {/* Cabeçalho */}
      <header className="bg-white border-b border-amber-200/60">
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-cic.png" alt="CIC" className="w-16 h-16 rounded-full object-contain mx-auto border-2 border-amber-300/70 bg-black p-1" />
          <h1 className="font-serif text-2xl sm:text-3xl font-bold mt-3" style={{ color: "#8c6d1f" }}>
            {config?.storeName ?? "CIC Fragrâncias & Glamour"}
          </h1>
          {config?.address && (
            <p className="text-xs text-neutral-500 mt-1 flex items-center justify-center gap-1">
              <MapPin className="w-3 h-3" /> {config.address}
            </p>
          )}
          <div className="gold-divider h-px w-40 mx-auto mt-4" />
        </div>
      </header>

      {/* Mensagem bonita enviada no link */}
      {msg && (
        <div className="max-w-5xl mx-auto px-4 mt-4">
          <div className="rounded-2xl border border-amber-300/70 bg-white shadow-sm px-5 py-4 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="font-serif italic text-base sm:text-lg text-neutral-800">{msg}</p>
          </div>
        </div>
      )}

      {/* Procura + categorias */}
      <div className="max-w-5xl mx-auto px-4 mt-4 sticky top-0 z-30 bg-[#faf8f3]/95 backdrop-blur py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar perfume, creme, marca…"
            className="w-full h-11 rounded-xl border border-amber-200 bg-white pl-9 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto py-2 -mx-1 px-1">
          {categorias.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                cat === c
                  ? "bg-neutral-900 text-amber-200 border-neutral-900"
                  : "bg-white text-neutral-600 border-amber-200 hover:border-amber-400"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <main className="max-w-5xl mx-auto px-4 pb-16">
        {estado === "carrega" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white border border-amber-100 overflow-hidden animate-pulse">
                <div className="aspect-square bg-amber-50" />
                <div className="p-3 space-y-2">
                  <div className="h-3.5 bg-amber-50 rounded" />
                  <div className="h-3 w-1/2 bg-amber-50 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {estado === "erro" && (
          <div className="text-center py-20 space-y-3">
            <p className="text-neutral-500">Não foi possível carregar o catálogo.</p>
            <button onClick={carregar} className="rounded-xl bg-neutral-900 text-amber-200 px-5 py-2.5 text-sm font-semibold">
              Tentar de novo
            </button>
          </div>
        )}

        {estado === "ok" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {visiveis.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelecionado(item)}
                  className="text-left rounded-2xl bg-white border border-amber-100 overflow-hidden shadow-sm hover:shadow-md hover:border-amber-300 transition-all active:scale-[0.98]"
                >
                  <div className="aspect-square bg-gradient-to-br from-amber-50 to-white flex items-center justify-center relative">
                    {item.imagem ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imagem} alt={item.nome} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-serif text-3xl" style={{ color: "#d4af37" }}>{iniciais(item.nome)}</span>
                    )}
                    {!item.disponivel && (
                      <span className="absolute top-2 right-2 rounded-full bg-neutral-900/85 text-amber-100 text-[10px] font-semibold px-2 py-0.5">
                        esgotado
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold leading-tight line-clamp-2">{item.nome}</p>
                    {(item.marca || item.categoria) && (
                      <p className="text-[11px] text-neutral-400 mt-0.5 truncate">{item.marca ?? item.categoria}</p>
                    )}
                    <p className="text-sm font-bold mt-1.5" style={{ color: "#8c6d1f" }}>{mt(item.preco)}</p>
                  </div>
                </button>
              ))}
            </div>
            {visiveis.length === 0 && (
              <p className="text-center text-neutral-400 py-16 text-sm">Nenhum produto encontrado para “{busca}”.</p>
            )}
          </>
        )}
      </main>

      {/* Rodapé */}
      <footer className="bg-white border-t border-amber-200/60">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center space-y-1.5">
          <div className="gold-divider h-px w-24 mx-auto mb-4" />
          {config?.receiptFooter && <p className="font-serif italic text-sm text-neutral-700">{config.receiptFooter}</p>}
          {config?.phone && (
            <p className="text-xs text-neutral-500 flex items-center justify-center gap-1"><Phone className="w-3 h-3" /> {config.phone}</p>
          )}
          <p className="text-[11px] text-neutral-400">{config?.storeName ?? "CIC Fragrâncias & Glamour"} · {config?.address ?? "Beira, Moçambique"}</p>
          <p className="text-[10px] italic text-neutral-400/60 select-none pt-1" title={APP_SIGNATURE_FULL}>{APP_SIGNATURE}</p>
        </div>
      </footer>

      {/* Detalhe do produto */}
      <Dialog open={!!selecionado} onOpenChange={(v) => { if (!v) { setSelecionado(null); setEntrega("levantar"); } }}>
        <DialogContent className="max-w-sm bg-white">
          {selecionado && (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">{selecionado.nome}</DialogTitle>
              </DialogHeader>
              <div className="aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-amber-50 to-white flex items-center justify-center">
                {selecionado.imagem ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selecionado.imagem} alt={selecionado.nome} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-serif text-5xl" style={{ color: "#d4af37" }}>{iniciais(selecionado.nome)}</span>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xl font-bold" style={{ color: "#8c6d1f" }}>{mt(selecionado.preco)}</p>
                <p className="text-xs text-neutral-500">
                  {[selecionado.categoria, selecionado.marca].filter(Boolean).join(" · ")}
                  {variante(selecionado) ? ` · ${variante(selecionado)}` : ""}
                </p>
                <p className={`text-xs font-semibold ${selecionado.disponivel ? "text-green-600" : "text-red-500"}`}>
                  {selecionado.disponivel ? "✓ Disponível na loja" : "Esgotado - fale connosco para reservar"}
                </p>
              </div>
              {encomendar(selecionado) ? (
                <>
                  {/* Escolha da entrega - vai na mensagem do WhatsApp */}
                  <div>
                    <p className="text-[11px] font-medium text-neutral-500 mb-1.5">Como prefere receber?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEntrega("levantar")}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          entrega === "levantar"
                            ? "bg-neutral-900 text-amber-200 border-neutral-900"
                            : "bg-white text-neutral-600 border-amber-200 hover:border-amber-400"
                        }`}
                      >
                        <Store className="w-3.5 h-3.5" /> Levantar na loja
                      </button>
                      <button
                        type="button"
                        onClick={() => setEntrega("casa")}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          entrega === "casa"
                            ? "bg-neutral-900 text-amber-200 border-neutral-900"
                            : "bg-white text-neutral-600 border-amber-200 hover:border-amber-400"
                        }`}
                      >
                        <Bike className="w-3.5 h-3.5" /> Receber em casa
                      </button>
                    </div>
                  </div>
                  <a href={encomendar(selecionado) ?? "#"} target="_blank" rel="noopener noreferrer" className="block">
                    <button className="w-full h-11 rounded-xl bg-[#25D366] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.99] transition-all">
                      <MessageCircle className="w-4.5 h-4.5" /> Encomendar no WhatsApp
                    </button>
                  </a>
                </>
              ) : (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-2 text-sm text-neutral-700">
                  <PackageX className="w-4 h-4 text-amber-500 shrink-0" />
                  Visite-nos na loja ou fale connosco para encomendar.
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function LojaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#faf8f3]" />}>
      <PortalLoja />
    </Suspense>
  );
}
