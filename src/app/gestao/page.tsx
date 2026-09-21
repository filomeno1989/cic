"use client";

// ============================================================
// v2.3 CAMUFLAGEM - porta de entrada do PESSOAL.
// O ecrã de login não vive mais na raiz: quem abrir
// cic-loja.vercel.app/ cai no portal público da loja (/loja).
// A equipa (e o dono, via "Acesso por código") entra por:
//   cic-loja.vercel.app/gestao
// ============================================================
import { useEffect } from "react";
import { LoginScreen } from "@/components/login";
import type { SessionUser } from "@/lib/types";

const SESSION_KEY = "cic_session_user";

export default function GestaoPage() {

  useEffect(() => {
    // Já tem sessão nesta janela (ex.: PWA reaberto)? Vá direto para o sistema.
    try {
      if (sessionStorage.getItem(SESSION_KEY)) window.location.replace("/");
    } catch { /* ignora */ }
  }, []);

  const handleLogin = (u: SessionUser) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(u));
    window.location.replace("/");
  };

  return <LoginScreen onLogin={handleLogin} />;
}
