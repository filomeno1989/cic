"use client";

// ============================================================
// v3.2 (F4): painel de MODO DE MANUTENÇÃO - usado no ecrã de
// login (quando o dono fechou o sistema) e no overlay do app
// (quando fecha a meio do uso). Dourado/escuro, como o sistema.
// ============================================================
import { Wrench, Clock } from "lucide-react";
import { mostraHora } from "@/lib/hora-manutencao";

export function ManutencaoAviso({
  mensagem,
  fim,
  compacto,
}: {
  mensagem: string;
  fim?: string; // previsão de retorno (opcional)
  compacto?: boolean; // versão menor para o overlay dentro do app
}) {
  return (
    <div className={`text-center space-y-${compacto ? "3" : "4"}`}>
      <div
        className={`${compacto ? "w-16 h-16" : "w-20 h-20"} mx-auto rounded-full bg-[#2a2310] border-2 border-[#d4af37]/50 flex items-center justify-center pulse-gold`}
      >
        <Wrench className={`${compacto ? "w-7 h-7" : "w-9 h-9"} text-[#d4af37]`} />
      </div>
      <div className="space-y-1.5">
        <h2 className={`${compacto ? "text-lg" : "text-xl"} font-serif gold-text tracking-wide`}>Sistema em Manutenção</h2>
        <p className="text-sm text-[#a1a1aa] leading-relaxed max-w-xs mx-auto">{mensagem}</p>
        {fim && (
          <p className="text-xs text-[#e9d9a8] inline-flex items-center gap-1.5 bg-[#2a2310] border border-[#d4af37]/40 rounded-full px-3 py-1">
            <Clock className="w-3.5 h-3.5" /> Previsão de retorno: {mostraHora(fim)}
          </p>
        )}
      </div>
    </div>
  );
}
