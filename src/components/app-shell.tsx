"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { mt } from "@/lib/format";
import type { SessionUser } from "@/lib/types";
import type { StoreInfo } from "@/components/receipt";
import { APP_VERSION_LABEL, APP_SIGNATURE, APP_SIGNATURE_FULL } from "@/lib/version";
import {
  LayoutDashboard, ShoppingCart, Package, Users, Wallet, Users2, FileBarChart, Settings,
  LogOut, Moon, Sun, Wifi, WifiOff, RefreshCw, Menu, X, Loader2, CheckCircle2,
} from "lucide-react";
import Image from "next/image";

export type ViewKey = "dashboard" | "pdv" | "produtos" | "clientes" | "financeiro" | "rh" | "relatorios" | "definicoes";

const NAV: Array<{ key: ViewKey; label: string; labelCaixa?: string; icon: typeof LayoutDashboard; managerOnly?: boolean }> = [
  { key: "dashboard", label: "Painel", icon: LayoutDashboard },
  { key: "pdv", label: "Frente de Caixa", icon: ShoppingCart },
  { key: "clientes", label: "Clientes & Fiação", icon: Users },
  { key: "financeiro", label: "Financeiro", labelCaixa: "Fecho de Caixa", icon: Wallet },
  { key: "rh", label: "Recursos Humanos", labelCaixa: "Os Meus Vales", icon: Users2 },
  { key: "produtos", label: "Produtos & Stock", icon: Package, managerOnly: true },
  { key: "relatorios", label: "Vendas", icon: FileBarChart, managerOnly: true },
  { key: "definicoes", label: "Definições", icon: Settings, managerOnly: true },
];

export function AppShell({
  user, store, online, pendingCount, syncing, lastSync, syncAlert, onDismissSyncAlert,
  view, setView, onLogout, onManualSync, children,
}: {
  user: SessionUser;
  store: StoreInfo;
  online: boolean;
  pendingCount: number;
  syncing: boolean;
  lastSync: string | null;
  syncAlert?: string | null;
  onDismissSyncAlert?: () => void;
  view: ViewKey;
  setView: (v: ViewKey) => void;
  onLogout: () => void;
  onManualSync: () => void;
  children: React.ReactNode;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const isManager = user.role === "GERENTE";
  const nav = NAV.filter((n) => !n.managerOnly || isManager);

  const SidebarContent = (
    <>
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-black border border-gold/40 shrink-0 flex items-center justify-center">
          <Image src="/logo-cic.png" alt="CIC" width={44} height={44} className="object-contain" priority />
        </div>
        <div className="min-w-0">
          <p className="font-serif font-bold text-sm leading-tight gold-text">CIC Fragrâncias</p>
          <p className="text-[10px] text-muted-foreground tracking-wider uppercase">& Glamour · Beira</p>
        </div>
      </div>
      <div className="gold-divider mx-4" />
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map((n) => (
          <button
            key={n.key}
            onClick={() => { setView(n.key); setMenuOpen(false); }}
            className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
              view === n.key
                ? "btn-gold shadow-md"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <n.icon className="w-4 h-4 shrink-0" />
            {isManager ? n.label : n.labelCaixa ?? n.label}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{user.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {isManager ? "Gerente" : "Caixa"} · comissão {user.commissionPct}%
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onLogout} title="Sair">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
        {/* Versão + assinatura de produção - discreto, sempre visível no fim da barra lateral */}
        <div className="mt-3 pt-2 text-center select-none" style={{ borderTop: "1px dashed color-mix(in oklab, var(--gold) 25%, transparent)" }}>
          <p className="text-[9px] text-muted-foreground/80">{APP_VERSION_LABEL}</p>
          <p className="text-[9px] italic text-muted-foreground/60 mt-0.5" title={APP_SIGNATURE_FULL}>{APP_SIGNATURE}</p>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Topbar */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b" style={{ borderColor: "color-mix(in oklab, var(--gold) 25%, var(--border))" }}>
        <div className="flex items-center gap-2 px-3 sm:px-4 h-14">
          <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>

          {/* Estado da rede */}
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
              online
                ? "bg-green-500/10 text-green-600"
                : "bg-amber-500/15 text-amber-600"
            }`}
            title={online ? "Ligado ao servidor" : "Offline - as vendas ficam guardadas no aparelho"}
          >
            {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{online ? "Online" : "Offline"}</span>
            {pendingCount > 0 && (
              <span className="ml-0.5 bg-gold text-black text-[10px] rounded-full px-1.5 py-0.5">{pendingCount}</span>
            )}
          </div>

          {(pendingCount > 0 || syncing) && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onManualSync} disabled={syncing || !online}>
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline ml-1">Sincronizar</span>
            </Button>
          )}
          {syncing && online && <span className="text-xs text-muted-foreground hidden md:inline">a sincronizar…</span>}
          {!syncing && lastSync && pendingCount === 0 && (
            <span className="text-xs text-green-600 hidden md:inline items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 inline" /> sincronizado</span>
          )}

          <div className="flex-1" />

          <div className="hidden sm:block text-right mr-2">
            <p className="text-[10px] text-muted-foreground leading-none">{store.storeName}</p>
            <p className="text-[10px] text-muted-foreground">{store.address}</p>
          </div>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            title={resolvedTheme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {resolvedTheme === "dark" ? <Sun className="w-4.5 h-4.5 text-gold" /> : <Moon className="w-4.5 h-4.5 text-gold" />}
          </Button>
        </div>
      </header>

      {/* Alerta de vendas offline recusadas pelo servidor */}
      {syncAlert && (
        <div className="flex items-center justify-between gap-3 bg-destructive/10 border-b border-destructive/30 text-destructive px-4 py-2.5 text-sm">
          <span className="min-w-0 truncate">⚠ {syncAlert}</span>
          <button className="text-xs underline shrink-0" onClick={onDismissSyncAlert}>fechar</button>
        </div>
      )}

      <div className="flex flex-1">
        {/* Sidebar desktop */}
        <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r bg-card" style={{ borderColor: "color-mix(in oklab, var(--gold) 18%, var(--border))" }}>
          {SidebarContent}
        </aside>

        {/* Sidebar mobile */}
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-card flex flex-col border-r shadow-2xl">
              {SidebarContent}
            </aside>
          </div>
        )}

        {/* Conteúdo */}
        <main className="flex-1 min-w-0 p-3 sm:p-5 overflow-x-hidden flex flex-col">
          <div className="flex-1">{children}</div>
          {/* Fim do sistema: versão + assinatura de produção */}
          <footer className="pt-10 pb-1 text-center select-none" title={APP_SIGNATURE_FULL}>
            <p className="text-[10px] text-muted-foreground/70">{APP_VERSION_LABEL}</p>
            <p className="text-[10px] italic text-muted-foreground/50 mt-0.5">{APP_SIGNATURE}</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
