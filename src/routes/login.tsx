import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthRole } from "@/lib/auth.server";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Painel executivo" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginPage,
});

function safeRedirect() {
  if (typeof window === "undefined") return "/";
  const destination = new URLSearchParams(window.location.search).get("redirect");
  return destination?.startsWith("/") && !destination.startsWith("//") && destination !== "/login"
    ? destination
    : "/";
}

function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((session: { authenticated?: boolean; user?: { role?: AuthRole } }) => {
        if (session.authenticated)
          window.location.replace(session.user?.role === "admin" ? "/usuarios" : safeRedirect());
      })
      .catch(() => undefined);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const payload = (await response.json()) as { message?: string; user?: { role?: AuthRole } };
      if (!response.ok) {
        setMessage(payload.message ?? "Não foi possível entrar.");
        return;
      }
      if (mode === "register") {
        setRegistered(true);
        setMessage(payload.message ?? "Cadastro enviado para aprovação.");
      } else {
        window.location.replace(payload.user?.role === "admin" ? "/usuarios" : safeRedirect());
      }
    } catch {
      setMessage("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-5 sm:p-8 lg:p-12">
      <div className="grid w-full max-w-[32rem] overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-foreground/5 md:min-h-[38rem] md:max-w-[72rem] md:grid-cols-[1.1fr_1fr]">
        <header className="relative isolate flex min-h-44 flex-col justify-center overflow-hidden bg-[#21132d] px-6 py-7 text-white sm:px-8 md:justify-start md:p-10 lg:p-14 lg:pt-12">
          <img
            src="/login-arquitetura.webp"
            alt=""
            className="absolute inset-0 -z-20 size-full object-cover object-[center_58%] md:object-[center_42%]"
            fetchPriority="high"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-linear-to-r from-[#1b1026]/95 via-[#1b1026]/70 to-[#1b1026]/35 md:bg-linear-to-b md:from-[#1b1026]/90 md:via-[#1b1026]/25 md:to-[#1b1026]/25"
          />
          <div aria-hidden="true" className="mb-4 h-0.5 w-8 bg-[#d8b4fe] md:mb-6" />
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight md:max-w-[9ch] md:text-5xl md:leading-[1.02] lg:text-6xl">
            Painel executivo
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/85 md:mt-5 md:text-base">
            Visão geral de toda a operação
          </p>
        </header>

        <section
          aria-labelledby="login-heading"
          className="flex items-center justify-center px-6 py-7 sm:p-8 md:px-9 md:py-10 lg:px-12"
        >
          <div className="w-full max-w-[22rem]">
            <h2 id="login-heading" className="text-xl font-semibold tracking-tight md:text-2xl">
              {mode === "login" ? "Acesse o painel" : "Solicite seu acesso"}
            </h2>
            {mode === "register" && !registered && (
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                Seu cadastro será analisado pelo administrador.
              </p>
            )}

            {registered ? (
              <div className="mt-7">
                <div
                  className="rounded-md border border-success/25 bg-success/10 p-4"
                  role="status"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-success">
                    <CheckCircle2 aria-hidden className="size-4 shrink-0" /> Solicitação enviada
                  </p>
                  <p className="mt-1 text-sm leading-5 text-foreground">{message}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5 h-11 w-full"
                  onClick={() => {
                    setMode("login");
                    setRegistered(false);
                    setMessage("");
                    setPassword("");
                  }}
                >
                  Voltar para o login
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-5 md:mt-8">
                {mode === "register" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome completo</Label>
                      <Input
                        id="name"
                        name="name"
                        autoComplete="name"
                        required
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Seu nome"
                        className="h-11 bg-background px-3"
                      />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nome@empresa.com.br"
                    className="h-11 bg-background px-3"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Digite sua senha"
                      className="h-11 bg-background px-3 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-md text-muted-foreground transition hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {message && (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive"
                  >
                    {message}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={submitting}
                  className="h-11 w-full justify-between px-4 text-sm font-semibold md:h-11"
                >
                  {submitting
                    ? mode === "login"
                      ? "Validando acesso..."
                      : "Enviando cadastro..."
                    : mode === "login"
                      ? "Entrar no painel"
                      : "Solicitar cadastro"}
                  {submitting ? (
                    <LoaderCircle aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight aria-hidden className="size-4" />
                  )}
                </Button>
              </form>
            )}

            {!registered && (
              <button
                type="button"
                onClick={() => {
                  setMode((current) => (current === "login" ? "register" : "login"));
                  setMessage("");
                }}
                className="mt-3 min-h-11 rounded-md text-left text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card focus-visible:outline-none"
              >
                {mode === "login" ? "Ainda não tenho acesso" : "Já tenho um cadastro"}
              </button>
            )}
            <p className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-xs leading-5 text-muted-foreground md:mt-5 md:pt-5">
              <LockKeyhole aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Sessão protegida e encerrada automaticamente após 8 horas.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
