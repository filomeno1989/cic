"use client";

// v2.4 - Rede de segurança global: se qualquer ecrã rebentar com um erro de
// JavaScript, o utilizador vê esta mensagem (em português) em vez de um ecrã
// congelado/branco, e pode tentar de novo sem perder a sessão.
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro inesperado:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="card-lux max-w-md w-full p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <span className="text-2xl">⚠️</span>
        </div>
        <h2 className="text-lg font-bold">Algo correu mal</h2>
        <p className="text-sm text-muted-foreground">
          Ocorreu um erro inesperado no ecrã. Os seus dados estão seguros.
          Tente novamente ou volte ao início.
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="btn-gold rounded-lg px-4 py-2 text-sm font-medium"
          >
            Tentar de novo
          </button>
          <a
            href="/gestao"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Voltar ao início
          </a>
        </div>
        {error.digest && (
          <p className="text-[10px] text-muted-foreground font-mono">
            Ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
