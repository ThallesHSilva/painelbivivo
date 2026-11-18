import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle } from "lucide-react";
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
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-8 sm:px-6 sm:py-12">
      <div className="grid w-full max-w-[28rem] items-center gap-6 md:max-w-[54rem] md:grid-cols-2 md:gap-10 lg:gap-16">
        <header className="border-l-2 border-primary pl-4 md:pl-6">
          <h1 className="text-2xl font-semibold tracking-tight md:text-4xl">Painel executivo</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base">
            Visão geral de toda a operação
          </p>
        </header>

        <section aria-labelledby="login-heading">
          <div className="rounded-xl border border-border bg-card p-5 sm:p-8">
            <h2 id="login-heading" className="text-lg font-semibold tracking-tight">
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
              <form onSubmit={submit} className="mt-6 space-y-4">
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
                  className="h-11 w-full gap-2 text-sm font-semibold"
                >
                  {submitting ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                  {submitting
                    ? mode === "login"
                      ? "Validando acesso..."
                      : "Enviando cadastro..."
                    : mode === "login"
                      ? "Entrar no painel"
                      : "Solicitar cadastro"}
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
                className="mt-2 min-h-11 w-full rounded-md text-center text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {mode === "login" ? "Ainda não tenho acesso" : "Já tenho um cadastro"}
              </button>
            )}
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
            Sessão protegida e encerrada automaticamente após 8 horas.
          </p>
        </section>
      </div>
    </main>
  );
}
