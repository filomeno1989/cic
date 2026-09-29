"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Delete, Loader2, Lock, KeyRound, Sparkles, ArrowLeft, Eye, EyeOff, Clock, ChevronDown } from "lucide-react";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { fetchT } from "@/lib/http";
import type { SessionUser } from "@/lib/types";
import { APP_VERSION, APP_SIGNATURE, APP_SIGNATURE_FULL } from "@/lib/version";
import { mostraHora } from "@/lib/hora-manutencao";
import { ManutencaoAviso } from "@/components/manutencao-aviso";

// v3.2 (F4): estado público do modo de manutenção (via /api/manutencao-status)
type EstadoManutencao = {
  ativo: boolean; agendado: boolean; modo: string;
  mensagem: string; inicio: string; fim: string;
};

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
  const [verPin, setVerPin] = useState(false); // v2.9: olho para revelar/esconder o código
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const { toast } = useToast();

  // v3.2 (F4): estado da manutenção - lido no arranque e renovado a cada 60s
  // enquanto o ecrã estiver aberto (o dono fecha → o pessoal vê a partir de já)
  const [manut, setManut] = useState<EstadoManutencao | null>(null);
  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      try {
        const res = await fetchT("/api/manutencao-status");
        const d: EstadoManutencao = await res.json();
        if (vivo) setManut(d);
      } catch { /* offline → mantém o último estado */ }
    };
    ler();
    const t = window.setInterval(ler, 60000);
    return () => { vivo = false; window.clearInterval(t); };
  }, []);

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
        // v2.9: quando faltam 1-2 tentativas para o bloqueio, avisa já
        const restam = typeof data.restam === "number" ? data.restam : 0;
        const aviso =
          restam > 0 && restam <= 2
            ? ` · Resta${restam === 1 ? "m" : ""} ${restam} tentativa${restam === 1 ? "" : "s"} antes do bloqueio de 15 min`
            : "";
        throw new Error((data.error ?? "PIN inválido") + aviso);
      }
      const user: SessionUser & { avisoManutencao?: string } = await res.json();
      toast({ title: `Bem-vindo(a), ${user.name}`, description: user.role === "GERENTE" ? "Acesso de Gerente" : "Acesso de Caixa" });
      // v3.2 (F4): entrou, mas há manutenção marcada para mais tarde - avisa já
      if (user.avisoManutencao) {
        toast({ title: "Aviso de manutenção", description: user.avisoManutencao });
      }
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

  // v3.1: o dono pediu um DROPDOWN em vez dos cartões - escolhe o utilizador
  // em cima e o espaço do PIN fica logo em baixo. Trocar de utilizador limpa
  // o PIN a meio (ninguém herda o código que outro começou a digitar).
  const pick = (id: string) => {
    if (submitTimer.current) window.clearTimeout(submitTimer.current);
    setPin("");
    setError(false);
    setSelected(users.find((u) => u.id === id) ?? null);
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

  // v3.1: dropdown no lugar dos cartões (mesma regra: só se houver contas e
  // não estiver no modo "Acesso por código")
  const showSelect = !codeMode && usersLoaded && users.length > 0;

  // v3.0 (U4): aviso quando a sessão expirou a meio do dia - o interceptor
  // manda para /gestao?expirada=1; aqui explicamos ao pessoal o que aconteceu.
  const [avisoExpirada, setAvisoExpirada] = useState(false);
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("expirada") === "1") {
        setAvisoExpirada(true);
        window.history.replaceState(null, "", "/gestao"); // limpa o parâmetro do endereço
      }
    } catch { /* */ }
  }, []);

  const hint = codeMode
    ? "Digite o seu código de acesso"
    : selected
      ? `PIN de ${selected.name}`
      : "Escolha o utilizador · PIN de 4 a 6 dígitos";

  // v3.2: fragmentos reutilizados pelo login normal E pelo modo
  // "Acesso por código" dentro do ecrã de manutenção
  const barraPin = (
    /* v2.9: barra de código segmentada - cada dígito no seu quadrado,
        com o olho para revelar/esconder (pediu o dono). Começa em 4
        quadrados e cresce até 6, como as bolinhas antes. */
    <div className="flex items-center justify-center gap-2 mb-4">
      <div className="flex gap-2">
        {Array.from({ length: Math.min(6, Math.max(4, pin.length)) }).map((_, i) => (
          <span
            key={i}
            className={`w-10 h-12 rounded-lg border flex items-center justify-center text-xl font-semibold bg-[#1c1c1c] transition-all ${
              error
                ? "border-red-500 text-red-400"
                : i < pin.length
                  ? "border-[#d4af37] text-[#e9d9a8]"
                  : "border-[#3f3f46] text-transparent"
            }`}
          >
            {i < pin.length ? (verPin ? pin[i] : "•") : "·"}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setVerPin((v) => !v)}
        aria-label={verPin ? "Esconder código" : "Ver código"}
        title={verPin ? "Esconder código" : "Ver código"}
        className="h-12 px-3 rounded-lg border border-[#3f3f46] bg-[#1c1c1c] text-[#a1a1aa] hover:text-[#d4af37] hover:border-[#d4af37]/60 transition-colors"
      >
        {verPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  );

  const teclado = (
    <>
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
    </>
  );

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
          /* ---------- Login dropdown + avatar + PIN (v3.2) ---------- */
          <div className="bg-[#141414] border border-[#d4af37]/25 rounded-2xl p-6 shadow-2xl">
            {/* v3.2 (F4): manutenção AGENDADA ainda por começar → aviso amarelo, mas ainda entra-se */}
            {manut?.agendado && !manut?.ativo && (
              <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-4">
                <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Manutenção programada: <b>de {mostraHora(manut.inicio)} a {mostraHora(manut.fim)}</b> o sistema não estará operacional.
                </span>
              </div>
            )}

            {manut?.ativo ? (
              /* ---------- Sistema fechado pelo dono (F4) ---------- */
              codeMode ? (
                <>
                  <button
                    type="button"
                    onClick={leaveCodeMode}
                    className="flex items-center gap-1 text-xs text-[#a1a1aa] hover:text-[#d4af37] mb-3"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Voltar
                  </button>
                  <p className="text-center text-[11px] text-[#a1a1aa] mb-2">{hint}</p>
                  {barraPin}
                  {teclado}
                </>
              ) : (
                <>
                  <ManutencaoAviso mensagem={manut.mensagem} fim={manut.fim} />
                  <p className="text-center text-[11px] text-[#52525b] mt-5">
                    O pessoal não consegue entrar durante a manutenção. O proprietário entra abaixo com o código dele.
                  </p>
                  <button
                    type="button"
                    onClick={enterCodeMode}
                    className="w-full flex items-center justify-center gap-1.5 text-xs text-[#52525b] hover:text-[#d4af37] mt-3 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" /> Acesso por código
                  </button>
                </>
              )
            ) : (
              /* ---------- Login normal ---------- */
              <>
                {selected ? (
                  /* v3.2: utilizador escolhido - o avatar aparece e o dropdown cede o lugar */
                  <div className="flex flex-col items-center gap-2 mb-4">
                    <span className="w-16 h-16 rounded-full bg-gradient-to-br from-[#d4af37] to-[#8a6d1f] text-black flex items-center justify-center font-serif text-xl border-2 border-[#d4af37] shadow-lg">
                      {initials(selected.name)}
                    </span>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-zinc-100 leading-tight">{selected.name}</p>
                      <span
                        className={`inline-block mt-1 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                          selected.role === "GERENTE"
                            ? "text-[#d4af37] border-[#d4af37]/50"
                            : "text-zinc-500 border-zinc-700"
                        }`}
                      >
                        {selected.role === "GERENTE" ? "Gerente" : "Caixa"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (submitTimer.current) window.clearTimeout(submitTimer.current);
                        setSelected(null);
                        setPin("");
                        setError(false);
                      }}
                      className="flex items-center gap-1 text-[11px] text-[#a1a1aa] hover:text-[#d4af37] transition-colors"
                    >
                      <ChevronDown className="w-3.5 h-3.5" /> Trocar utilizador
                    </button>
                  </div>
                ) : (
                  showSelect && (
                    <div className="mb-4">
                      <label className="block text-[10px] uppercase tracking-widest text-[#a1a1aa] mb-1.5 px-1">
                        Utilizador
                      </label>
                      <Select value="" onValueChange={pick} disabled={loading}>
                        <SelectTrigger className="w-full h-12 rounded-xl bg-[#1c1c1c] border-[#3f3f46] text-zinc-100 text-sm hover:border-[#d4af37]/60 hover:bg-[#1c1c1c] data-[placeholder]:text-[#a1a1aa] focus-visible:border-[#d4af37] focus-visible:ring-[#d4af37]/30 aria-invalid:border-red-500">
                          <SelectValue placeholder="Selecionar utilizador…" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#141414] border-[#3f3f46] text-zinc-100 rounded-xl max-h-72">
                          {users.map((u) => (
                            <SelectItem
                              key={u.id}
                              value={u.id}
                              className="rounded-lg focus:bg-[#2a2310] focus:text-[#e9d9a8] [&_svg:not([class*='text-'])]:text-[#d4af37]"
                            >
                              <span className="flex items-center gap-2">
                                <span className="w-7 h-7 shrink-0 rounded-full bg-[#2a2310] border border-[#d4af37]/40 text-[#e9d9a8] text-[10px] font-serif flex items-center justify-center">
                                  {initials(u.name)}
                                </span>
                                <span className="text-sm">{u.name}</span>
                                <span
                                  className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                                    u.role === "GERENTE"
                                      ? "text-[#d4af37] border-[#d4af37]/50"
                                      : "text-zinc-500 border-zinc-700"
                                  }`}
                                >
                                  {u.role === "GERENTE" ? "Gerente" : "Caixa"}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
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
                {avisoExpirada && (
                  <p className="text-center text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3">
                    A sua sessão expirou por segurança. Entre de novo para continuar.
                  </p>
                )}
                {barraPin}
                {teclado}

                {/* Acesso discreto por código - o dono digita o PIN dele sem escolher
                    ninguém e o sistema reconhece a conta (nem aparece na lista). */}
                {!codeMode && (
                  <button
                    type="button"
                    onClick={enterCodeMode}
                    className="w-full flex items-center justify-center gap-1.5 text-xs text-[#52525b] hover:text-[#d4af37] mt-5 transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5" /> Acesso por código
                  </button>
                )}
              </>
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
