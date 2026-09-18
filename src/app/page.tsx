"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoginScreen } from "@/components/login";
import { AppShell, type ViewKey } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard-view";
import { PdvView } from "@/components/pdv-view";
import { ProdutosView } from "@/components/produtos-view";
import { ClientesView } from "@/components/clientes-view";
import { FinanceiroView } from "@/components/financeiro-view";
import { RhView } from "@/components/rh-view";
import { RelatoriosView } from "@/components/relatorios-view";
import { DefinicoesView } from "@/components/definicoes-view";
import { type StoreInfo } from "@/components/receipt";
import { cacheSettings, getCachedSettings, getQueue, getRejected, syncQueue } from "@/lib/offline";
import type { SessionUser, ProductVariantFlat } from "@/lib/types";

const SESSION_KEY = "cic_session_user";

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncAlert, setSyncAlert] = useState<string | null>(null);
  const [store, setStore] = useState<StoreInfo>(
    () => getCachedSettings() ?? { storeName: "CIC Fragrâncias & Glamour", phone: "", address: "Beira, Moçambique", receiptFooter: "Obrigado pela preferência!", thermalWidth: "80" }
  );
  const [catalog, setCatalog] = useState<ProductVariantFlat[]>([]);
  const [salesVersion, setSalesVersion] = useState(0);
  const syncingRef = useRef(false);

  // ----- Sessão -----
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch { /* sessão inválida */ }
    setReady(true);
  }, []);

  const handleLogin = (u: SessionUser) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(u));
    setUser(u);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
    setView("dashboard");
    // limpa também o cookie de sessão no servidor
    void fetch("/api/logout", { method: "POST" }).catch(() => {});
  };

  // ----- Rede + sync -----
  const doSync = useCallback(async (silent = true) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (!silent) setSyncing(true);
    try {
      const result = await syncQueue();
      setPendingCount(getQueue().length);
      if (result.synced > 0) {
        setLastSync(new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }));
        setSalesVersion((v) => v + 1);
      }
      if (result.rejected > 0) {
        setSalesVersion((v) => v + 1);
        const rejectedItems = getRejected();
        const reason = rejectedItems[rejectedItems.length - 1]?.reason ?? "recusada pelo servidor";
        setSyncAlert(`${result.rejected} venda(s) offline recusada(s): ${reason}`);
      }
    } catch { /* silencioso */ } finally {
      syncingRef.current = false;
      if (!silent) setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const update = () => {
      const isOnline = navigator.onLine;
      setOnline(isOnline);
      if (isOnline) void doSync(true);
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const t = setInterval(() => {
      setPendingCount(getQueue().length);
      if (navigator.onLine && getQueue().length > 0) void doSync(true);
    }, 20000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      clearInterval(t);
    };
  }, [doSync]);

  // ----- Settings + catálogo -----
  const loadStore = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setStore(data);
        cacheSettings(data);
      }
    } catch { /* usa cache */ }
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      if (res.ok) setCatalog(await res.json());
    } catch { /* offline */ }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadStore();
    loadCatalog();
  }, [user, loadStore, loadCatalog]);

  const bumpData = useCallback(() => {
    loadCatalog();
    setSalesVersion((v) => v + 1);
  }, [loadCatalog]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="w-10 h-10 rounded-full border-2 border-[#d4af37] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <AppShell
      user={user}
      store={store}
      online={online}
      pendingCount={pendingCount}
      syncing={syncing}
      lastSync={lastSync}
      view={view}
      setView={setView}
      onLogout={handleLogout}
      onManualSync={() => doSync(false)}
      syncAlert={syncAlert}
      onDismissSyncAlert={() => setSyncAlert(null)}
    >
      <div key={view} className="fade-up">
        {view === "dashboard" && (
          <DashboardView user={user} online={online} pendingCount={pendingCount} onGoTo={(v) => setView(v as ViewKey)} />
        )}
        {view === "pdv" && (
          <PdvView user={user} store={store} online={online} onStockChanged={bumpData} />
        )}
        {view === "produtos" && (
          <ProdutosView user={user} catalog={catalog} onReload={bumpData} />
        )}
        {view === "clientes" && (
          <ClientesView user={user} onClientsChanged={bumpData} />
        )}
        {view === "financeiro" && (
          <FinanceiroView user={user} online={online} onDataChanged={bumpData} />
        )}
        {view === "rh" && <RhView user={user} />}
        {view === "relatorios" && (
          <RelatoriosView user={user} store={store} onSalesChanged={bumpData} />
        )}
        {view === "definicoes" && (
          <DefinicoesView user={user} store={store} onSaved={(s) => { setStore(s); cacheSettings(s); }} />
        )}
      </div>
      {/* key p/ forçar remount de relatórios quando vendas mudam */}
      <span data-sales-version={salesVersion} className="hidden" />
    </AppShell>
  );
}
