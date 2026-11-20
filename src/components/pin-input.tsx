"use client";

// ============================================================
// v3.0: BARRA DE CÓDIGO SEGMENTADA reutilizável (com o olho)
// ------------------------------------------------------------
// Mesmo desenho da barra v2.9 do login (quadrados que crescem de
// 4 até 6, dígito dourado, olho para revelar/esconder) mas em
// versão neutra que funciona no tema claro e escuro do sistema.
// Usada no diálogo "Mudar a minha PIN"; o login mantém a sua
// própria (intocada) para não mexer no que já está validado.
// ============================================================

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function PinBar({
  value,
  error,
}: {
  value: string;
  error?: boolean;
}) {
  const [ver, setVer] = useState(false);
  const n = Math.min(6, Math.max(4, value.length));
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="flex gap-1.5">
        {Array.from({ length: n }).map((_, i) => (
          <span
            key={i}
            className={`w-9 h-11 rounded-lg border flex items-center justify-center text-lg font-semibold transition-all ${
              error
                ? "border-destructive text-destructive"
                : i < value.length
                  ? "border-gold text-gold bg-accent/60"
                  : "border-border text-transparent"
            }`}
          >
            {i < value.length ? (ver ? value[i] : "•") : "·"}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? "Esconder código" : "Ver código"}
        title={ver ? "Esconder código" : "Ver código"}
        className="h-11 px-2.5 rounded-lg border border-border text-muted-foreground hover:text-gold hover:border-gold/60 transition-colors"
      >
        {ver ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
      </button>
    </div>
  );
}

/** Teclado numérico compacto (o mesmo espírito do do login). */
export function PinKeypad({
  onDigito,
  onApagar,
  disabled,
}: {
  onDigito: (d: string) => void;
  onApagar: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button
          key={d}
          type="button"
          disabled={disabled}
          onClick={() => onDigito(d)}
          className="h-11 rounded-lg border border-border bg-card text-lg font-semibold hover:border-gold hover:bg-accent transition-colors disabled:opacity-50"
        >
          {d}
        </button>
      ))}
      <span />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDigito("0")}
        className="h-11 rounded-lg border border-border bg-card text-lg font-semibold hover:border-gold hover:bg-accent transition-colors disabled:opacity-50"
      >
        0
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onApagar}
        className="h-11 rounded-lg border border-border bg-card text-sm font-medium hover:border-gold hover:bg-accent transition-colors disabled:opacity-50"
      >
        ⌫
      </button>
    </div>
  );
}
