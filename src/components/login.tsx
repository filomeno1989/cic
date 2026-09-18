"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Delete, Loader2, Lock, KeyRound, Sparkles, ArrowLeft } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { fetchT } from "@/lib/http";
import type { SessionUser } from "@/lib/types";
import { APP_VERSION, APP_SIGNATURE, APP_SIGNATURE_FULL } from "@/lib/version";

type LoginUser = { id: string; name: string; role: string };

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

export function LoginScreen({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const { toast } = useToast();

  // Cartões de utilizador (Netflix-style). A conta do proprietário (isSystem)
  // NUNCA vem nesta lista - o dono entra pelo "Acesso por código".
  const [users, setUsers] = useState<LoginUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [selected, setSelected] = useState<LoginUser | null>(null);
  const [codeMode, setCodeMode] = useState(false); // modo privado: só teclado, sem cartões

  // Primeiro acesso: base de dados nova (ex: Supabase no Vercel) sem utilizadores
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [setupName, setSetupName] = useState("");
  const [setupPhone, setSetupPhone] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const submitTimer = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchT("/api/setup");
        const data = await res.json().catch(() => ({}));
        setSetupNeeded(!!data.needed);
      } catch { /* offline - assume que não precisa */ }
      try {
        const res = await fetchT("/api/login-users");
        const list: LoginUser[] = await res.json().catch(() => []);
        setUsers(Array.isArray(list) ? list : []);
      } catch {
        setUsers([]); // falha → só "Acesso por código"
      } finally {
        setUsersLoaded(true);
      }
    })();
    return () => { if (submitTimer.current) window.clearTimeout(submitTimer.current); };
  }, []);

  const submit = async (value: string) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetchT("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected ? { pin: value, userId: selected.id } : { pin: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "PIN inválido");
      }
      const user: SessionUser = await res.json();
      toast({ title: `Bem-vindo(a), ${user.name}`, description: user.role === "GERENTE" ? "Acesso de Gerente" : "Acesso de Caixa" });
      onLogin(user);
    } catch (e) {
      setError(true);
      setPin("");
      toast({ title: "PIN inválido", description: e instanceof Error ? e.message : "Tente novamente", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const press = (d: string) => {
    if (loading) return;
    const next = (pin + d).slice(0, 6);
    setPin(next);
    setError(false);
    // Auto-submit APÓS a última tecla (debounce): funciona bem com PIN de
    // 4, 5 ou 6 dígitos - antes submetia com 4 mesmo para PINs mais longos.
    if (next.length >= 4) {
      if (submitTimer.current) window.clearTimeout(submitTimer.current);
      submitTimer.current = window.setTimeout(() => submit(next), 500);
    }
  };

  const backspace = () => {
    if (submitTimer.current) window.clearTimeout(submitTimer.current);
    setPin(pin.slice(0, -1));
    setError(false);
  };

  const pick = (u: LoginUser) => {
    if (submitTimer.current) window.clearTimeout(submitTimer.current);
    setPin("");
    setError(false);
    setSelected((cur) => (cur?.id === u.id ? null : u));
  };

  const enterCodeMode = () => {
    if (submitTimer.current) window.clearTimeout(submitTimer.current);
    setPin("");
    setError(false);
    setSelected(null);
    setCodeMode(true);
  };

  const leaveCodeMode = () => {
    if (submitTimer.current) window.clearTimeout(submitTimer.current);
    setPin("");
    setError(false);
    setCodeMode(false);
  };

  const doSetup = async () => {
    if (!setupName.trim() || setupPin.length < 4) return;
    setSetupLoading(true);
    try {
      const res = await fetchT("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: setupName.trim(), pin: setupPin, phone: setupPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erro");
      toast({ title: "Conta de gerente criada!", description: "Entre com o seu PIN." });
      setSetupNeeded(false);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erro", variant: "destructive" });
    } finally {
      setSetupLoading(false);
    }
  };

  const showCards = !codeMode && usersLoaded && users.length > 0;
  const hint = codeMode
    ? "Digite o seu código de acesso"
    : selected
      ? `PIN de ${selected.name}`
      : "Toque no seu nome · PIN de 4 a 6 dígitos";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] relative overflow-hidden p-4">
      {/* brilho dourado de fundo */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(212,175,55,0.12), transparent)" }} />
      <div className="w-full max-w-md relative fade-up">
        <div className="flex flex-col items-center mb-7">
          <div className="w-32 h-32 rounded-full overflow-hidden bg-black flex items-center justify-center border border-[#d4af37]/40 pulse-gold">
            <Image src="/logo-cic.png" alt="CIC Fragrâncias & Glamour" width={116} height={116} className="object-contain" priority />
          </div>
          <h1 className="mt-4 text-2xl font-serif gold-text tracking-wide">CIC Fragrâncias & Glamour</h1>
          <p className="text-[#a1a1aa] text-sm mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Sistema de Gestão · Beira, Moçambique
          </p>
        </div>

        {setupNeeded ? (
          /* ---------- Primeiro acesso (BD nova) ---------- */
          <div className="bg-[#141414] border border-[#d4af37]/25 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="text-center">
              <Sparkles className="w-6 h-6 text-[#d4af37] mx-auto mb-2" />
              <h2 className="font-semibold text-zinc-100">Configuração inicial</h2>
              <p className="text-xs text-[#a1a1aa] mt-1">
                Este servidor ainda não tem contas. Crie a sua conta de <b className="text-[#d4af37]">Gerente</b> para começar.
              </p>
            </div>
            <Input
              placeholder="O seu nome *"
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
              className="bg-[#1c1c1c] border-[#3f3f46] text-zinc-100"
            />
            <Input
              placeholder="WhatsApp (opcional)"
              value={setupPhone}
              onChange={(e) => setSetupPhone(e.target.value)}
              className="bg-[#1c1c1c] border-[#3f3f46] text-zinc-100"
            />
            <Input
              placeholder="PIN de acesso (4-6 números) *"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={setupPin}
              onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, ""))}
              className="bg-[#1c1c1c] border-[#3f3f46] text-zinc-100 text-center tracking-[0.4em]"
              onKeyDown={(e) => e.key === "Enter" && doSetup()}
            />
            <Button
              className="btn-gold w-full"
              onClick={doSetup}
              disabled={setupLoading || !setupName.trim() || setupPin.length < 4}
            >
              {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar conta de Gerente"}
            </Button>
          </div>
        ) : (
          /* ---------- Login com cartões + PIN ---------- */
          <div className="bg-[#141414] border border-[#d4af37]/25 rounded-2xl p-6 shadow-2xl">
            {showCards && (
              <div className="flex flex-wrap justify-center gap-4 mb-5">
                {users.map((u) => {
                  const isSel = selected?.id === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => pick(u)}
                      className={`group flex flex-col items-center gap-1.5 rounded-xl px-3 py-2.5 transition-all ${
                        isSel ? "bg-[#2a2310] ring-2 ring-[#d4af37]" : "hover:bg-[#1c1c1c]"
                      }`}
                    >
                      <span
                        className={`w-14 h-14 rounded-full flex items-center justify-center font-serif text-lg transition-all ${
                          isSel
                            ? "bg-[#d4af37] text-black border-2 border-[#d4af37]"
                            : "bg-[#1c1c1c] text-[#e9d9a8] border-2 border-[#3f3f46] group-hover:border-[#d4af37]/60"
                        }`}
                      >
                        {initials(u.name)}
                      </span>
                      <span className={`text-xs font-medium leading-tight ${isSel ? "text-[#e9d9a8]" : "text-zinc-300"}`}>
                        {u.name}
                      </span>
                      <span
                        className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                          u.role === "GERENTE"
                            ? "text-[#d4af37] border-[#d4af37]/50"
                            : "text-zinc-500 border-zinc-700"
                        }`}
                      >
                        {u.role === "GERENTE" ? "Gerente" : "Caixa"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {codeMode && (
              <button
                type="button"
                onClick={leaveCodeMode}
                className="flex items-center gap-1 text-xs text-[#a1a1aa] hover:text-[#d4af37] mb-3"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar aos utilizadores
              </button>
            )}

            <p className="text-center text-[11px] text-[#a1a1aa] mb-2">{hint}</p>
            <div className="flex justify-center gap-3 mb-4 h-4">
              {/* Bolinhas dinâmicas: começam em 4 e crescem até 6 conforme se digita -
                  comunica visualmente que o PIN pode ter 4, 5 ou 6 dígitos */}
              {Array.from({ length: Math.min(6, Math.max(4, pin.length)) }).map((_, i) => (
                <span
                  key={i}
                  className={`w-3 h-3 rounded-full border transition-all ${
                    i < pin.length ? "bg-[#d4af37] border-[#d4af37]" : "border-[#52525b] " + (error ? "border-red-500" : "")
                  }`}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <Button
                  key={d}
                  variant="outline"
                  disabled={loading}
                  onClick={() => press(d)}
                  className="h-14 text-xl font-semibold bg-[#1c1c1c] border-[#3f3f46] text-zinc-100 hover:bg-[#2a2310] hover:border-[#d4af37] hover:text-[#e9d9a8] rounded-xl"
                >
                  {d}
                </Button>
              ))}
              <div />
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => press("0")}
                className="h-14 text-xl font-semibold bg-[#1c1c1c] border-[#3f3f46] text-zinc-100 hover:bg-[#2a2310] hover:border-[#d4af37] hover:text-[#e9d9a8] rounded-xl"
              >
                0
              </Button>
              <Button
                variant="outline"
                disabled={loading}
                onClick={backspace}
                className="h-14 bg-[#1c1c1c] border-[#3f3f46] text-zinc-100 hover:bg-[#2a2310] hover:border-[#d4af37] rounded-xl"
              >
                <Delete className="w-5 h-5" />
              </Button>
            </div>

            {loading && (
              <div className="flex justify-center mt-5 text-[#d4af37]">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}

            {/* Acesso discreto por código - o dono digita o PIN dele sem escolher
                ninguém e o sistema reconhece a conta (nem aparece nos cartões). */}
            {!codeMode && (
              <button
                type="button"
                onClick={enterCodeMode}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-[#52525b] hover:text-[#d4af37] mt-5 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" /> Acesso por código
              </button>
            )}
          </div>
        )}

        {/* Assinatura discreta de produção no fim do ecrã de entrada */}
        <p className="text-center text-[10px] italic text-[#52525b] mt-6 select-none" title={APP_SIGNATURE_FULL}>
          {APP_SIGNATURE} · v{APP_VERSION}
        </p>
      </div>
    </div>
  );
}
