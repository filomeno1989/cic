"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { mt, fmtDate } from "@/lib/format";
import type { SessionUser } from "@/lib/types";
import {
  TrendingUp, ShoppingCart, Banknote, Smartphone, CreditCard, HandCoins, Wallet,
  CalendarClock, PackageX, AlertTriangle, WifiOff, Eye, Loader2,
} from "lucide-react";

type DashData = {
  today: {
    total: number; count: number; cash: number; mobile: number; pos: number; credit: number;
    expenses: number; amortizations: number; profit: number | null;
  };
  chart: Array<{ day: string; total: number }>;
  expiring: Array<{ product: string; variantLabel: string; expiryDate: string; days: number; stock: number }>;
  lowStock: Array<{ product: string; variantLabel: string; stock: number; minStock: number }>;
  debtors: Array<{ id: string; name: string; balance: number }>;
  debtTotal: number;
};

export function DashboardView({
  user, online, pendingCount, onGoTo,
}: {
  user: SessionUser;
  online: boolean;
  pendingCount: number;
  onGoTo: (view: string) => void;
}) {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const isManager = user.role === "GERENTE";

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard"); // papel e userId vêm da sessão no servidor
        if (res.ok && alive) setData(await res.json());
      } catch { /* offline */ } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [user, online]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-gold" />
      </div>
    );
  }

  const kpis = [
    { label: "Vendas de hoje", value: mt(data?.today.total ?? 0), icon: TrendingUp, sub: `${data?.today.count ?? 0} venda(s)`, gold: true },
    { label: "Dinheiro na gaveta", value: mt(data?.today.cash ?? 0), icon: Banknote, sub: "entradas em dinheiro" },
    { label: "Mobile Money", value: mt(data?.today.mobile ?? 0), icon: Smartphone, sub: "M-Pesa · e-Mola · mKesh" },
    { label: "POS / Cartão", value: mt(data?.today.pos ?? 0), icon: CreditCard, sub: "comprovativos" },
    ...(isManager
      ? [{ label: "Lucro estimado (hoje)", value: mt(data?.today.profit ?? 0), icon: Wallet, sub: "após custos e despesas", gold: true }]
      : [{ label: "Fiação emitida hoje", value: mt(data?.today.credit ?? 0), icon: HandCoins, sub: "vendido a crédito" }]),
  ];

  const maxChart = Math.max(...(data?.chart ?? []).map((c) => c.total), 1);

  return (
    <div className="space-y-5">
      {!online && (
        <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-xl px-4 py-3 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            <b>Sem internet</b> - o sistema continua a funcionar. As vendas ficam guardadas no aparelho
            {pendingCount > 0 && <>, tem <b>{pendingCount} venda(s)</b> por sincronizar</>}.
          </span>
        </div>
      )}
      {online && pendingCount > 0 && (
        <div className="flex items-center gap-2.5 bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-400 rounded-xl px-4 py-3 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span><b>{pendingCount} venda(s)</b> feitas offline por sincronizar - serão enviadas automaticamente.</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={`card-lux p-4 ${k.gold ? "ring-1 ring-gold/40" : ""}`}>
            <k.icon className={`w-4 h-4 mb-2 ${k.gold ? "text-gold" : "text-muted-foreground"}`} />
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p>
            <p className="text-lg xl:text-xl font-bold mt-0.5 truncate" title={k.value}>{k.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Gráfico 7 dias */}
        <div className="card-lux p-4">
          <h3 className="text-sm font-semibold mb-4">Últimos 7 dias</h3>
          <div className="flex items-end gap-2 h-36">
            {(data?.chart ?? []).map((c, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-muted-foreground">{c.total > 0 ? Math.round(c.total / 1000) + "k" : ""}</span>
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${Math.max(4, (c.total / maxChart) * 100)}%`,
                    background: i === (data?.chart.length ?? 1) - 1
                      ? "linear-gradient(180deg, #d4af37, #b08d2e)"
                      : "color-mix(in oklab, var(--gold) 35%, var(--muted))",
                  }}
                  title={mt(c.total)}
                />
                <span className="text-[10px] text-muted-foreground">{c.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas */}
        <div className="space-y-3">
          {/* Validade */}
          <div className="card-lux p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-2.5">
              <CalendarClock className="w-4 h-4 text-amber-600" /> Validade a expirar
              {data && data.expiring.length > 0 && <Badge className="bg-amber-500 hover:bg-amber-500 text-white ml-auto">{data.expiring.length}</Badge>}
            </h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {data?.expiring.slice(0, 6).map((e, i) => (
                <div key={i} className="flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg bg-muted/50">
                  <span className="truncate">{e.product} <span className="text-gold">{e.variantLabel}</span></span>
                  <Badge variant={e.days <= 30 ? "destructive" : "secondary"} className={`ml-2 shrink-0 text-[10px] ${e.days > 30 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : ""}`}>
                    {e.days <= 0 ? "expirado" : `${e.days}d`}
                  </Badge>
                </div>
              ))}
              {data?.expiring.length === 0 && <p className="text-xs text-muted-foreground">Nada a expirar nos próximos 90 dias.</p>}
            </div>
            <button className="text-xs text-gold underline mt-2" onClick={() => onGoTo("produtos")}>Ver todos</button>
          </div>

          {/* Stock baixo */}
          <div className="card-lux p-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-2.5">
              <PackageX className="w-4 h-4 text-destructive" /> Stock baixo
              {data && data.lowStock.length > 0 && <Badge variant="destructive" className="ml-auto">{data.lowStock.length}</Badge>}
            </h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {data?.lowStock.slice(0, 6).map((e, i) => (
                <div key={i} className="flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg bg-muted/50">
                  <span className="truncate">{e.product} <span className="text-gold">{e.variantLabel}</span></span>
                  <span className="text-destructive font-semibold shrink-0 ml-2">{e.stock} / mín {e.minStock}</span>
                </div>
              ))}
              {data?.lowStock.length === 0 && <p className="text-xs text-muted-foreground">Todo o stock acima do mínimo.</p>}
            </div>
            <button className="text-xs text-gold underline mt-2" onClick={() => onGoTo("produtos")}>Repor stock</button>
          </div>
        </div>
      </div>

      {/* Devedores */}
      {isManager && (
        <div className="card-lux p-4">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <HandCoins className="w-4 h-4 text-amber-600" /> Fiação a receber - <span className="text-gold">{mt(data?.debtTotal ?? 0)}</span>
            </h3>
            <button className="text-xs text-gold underline" onClick={() => onGoTo("clientes")}>Gerir fiação</button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {data?.debtors.slice(0, 8).map((d) => (
              <div key={d.id} className="flex justify-between items-center text-xs px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
                <span className="truncate font-medium">{d.name}</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold shrink-0 ml-1">{mt(d.balance)}</span>
              </div>
            ))}
            {data?.debtors.length === 0 && <p className="text-xs text-muted-foreground">Nenhum cliente deve fiação. 🎉</p>}
          </div>
        </div>
      )}
    </div>
  );
}
