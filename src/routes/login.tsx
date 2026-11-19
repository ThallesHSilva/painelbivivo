import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthRole } from "@/lib/auth.server";
import { PasswordRecoveryForm } from "@/components/PasswordRecoveryForm";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Painel executivo" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
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
  const [emailSent, setEmailSent] = useState(false);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [notice, setNotice] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    function readVerificationLink() {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const token = params.get("verify");
      const reset = params.get("reset");
      if (!token && !reset) return false;
      setVerificationToken(reset ? null : token);
      setResetToken(reset);
      setRecovering(Boolean(reset));
      setPassword("");
      setVerified(false);
      setRegistered(false);
      setMode("login");
      setMessage("");
      setNotice("");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return true;
    }
    window.addEventListener("hashchange", readVerificationLink);
    if (!readVerificationLink()) {
      void fetch("/api/auth/session", { cache: "no-store" })
        .then((response) => response.json())
        .then((session: { authenticated?: boolean; user?: { role?: AuthRole } }) => {
          if (session.authenticated)
            window.location.replace(session.user?.role === "admin" ? "/usuarios" : safeRedirect());
        })
        .catch(() => undefined);
    }
    return () => window.removeEventListener("hashchange", readVerificationLink);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    setNotice("");
    setVerificationNeeded(false);

    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const payload = (await response.json()) as {
        message?: string;
        reason?: string;
        emailSent?: boolean;
        user?: { role?: AuthRole };
      };
      if (!response.ok) {
        setMessage(payload.message ?? "Não foi possível entrar.");
        setVerificationNeeded(payload.reason === "unverified" || response.status === 409);
        return;
      }
      if (mode === "register") {
        setRegistered(true);
        setEmailSent(payload.emailSent === true);
        if (payload.emailSent) {
          setMessage("");
          setNotice(payload.message ?? "Enviamos o link de confirmação para seu e-mail.");
        } else {
          setMessage(payload.message ?? "Seu cadastro foi salvo, mas o envio do e-mail falhou.");
        }
      } else {
        window.location.replace(payload.user?.role === "admin" ? "/usuarios" : safeRedirect());
      }
    } catch {
      setMessage("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const resendVerification = async () => {
    if (submitting) return;
    setSubmitting(true);
    setNotice("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as { message: string };
      if (!response.ok) {
        setMessage(payload.message);
        return;
      }
      setEmailSent(true);
      setNotice(payload.message);
    } catch {
      setMessage("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmEmail = async () => {
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: verificationToken }),
      });
      const payload = (await response.json()) as { message: string };
      if (!response.ok) {
        setMessage(payload.message);
        return;
      }
      setVerified(true);
      setNotice(payload.message);
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
              {recovering
                ? resetToken
                  ? "Redefina sua senha"
                  : "Recupere seu acesso"
                : verificationToken
                  ? verified
                    ? "E-mail confirmado"
                    : "Confirme seu e-mail"
                  : mode === "login"
                    ? "Acesse o painel"
                    : "Solicite seu acesso"}
            </h2>
            {!recovering && mode === "register" && !registered && (
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                Confirme seu e-mail após o cadastro e aguarde a aprovação do administrador.
              </p>
            )}

            {recovering ? (
              <PasswordRecoveryForm
                key={resetToken ?? "request"}
                token={resetToken}
                initialEmail={email}
                onBack={() => {
                  setRecovering(false);
                  setResetToken(null);
                  setMode("login");
                  setMessage("");
                  setNotice("");
                  setPassword("");
                  setVerificationNeeded(false);
                }}
                onRequestNew={() => setResetToken(null)}
              />
            ) : verificationToken ? (
              <div className="mt-6 space-y-4">
                <p className="text-sm leading-6 text-muted-foreground" role="status">
                  {verified
                    ? notice
                    : "Clique abaixo para confirmar que este e-mail pertence a você. O link é válido por 1 hora."}
                </p>
                {message && (
                  <p role="alert" className="text-sm leading-5 text-destructive">
                    {message}
                  </p>
                )}
                {!verified && (
                  <Button
                    type="button"
                    disabled={submitting}
                    onClick={() => void confirmEmail()}
                    className="h-11 w-full md:h-11"
                  >
                    {submitting && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                    Confirmar meu e-mail
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  className="h-11 w-full md:h-11"
                  onClick={() => {
                    setVerificationToken(null);
                    setMessage("");
                    setNotice("");
                  }}
                >
                  Voltar para o login
                </Button>
              </div>
            ) : registered ? (
              <div className="mt-7">
                <div
                  className="rounded-md border border-success/25 bg-success/10 p-4"
                  role="status"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-success">
                    {emailSent ? (
                      <Mail aria-hidden className="size-4 shrink-0" />
                    ) : (
                      <CheckCircle2 aria-hidden className="size-4 shrink-0" />
                    )}
                    {emailSent ? "Confira seu e-mail" : "Cadastro salvo"}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-foreground">
                    {notice ||
                      (emailSent
                        ? "Abra o link enviado para confirmar seu endereço. Confira também a pasta de spam. O acesso depende da aprovação do administrador."
                        : "O envio falhou. Você pode solicitar um novo link abaixo.")}
                  </p>
                </div>
                {message && (
                  <p role="alert" className="mt-3 text-sm leading-5 text-destructive">
                    {message}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  className="mt-4 h-11 w-full md:h-11"
                  onClick={() => void resendVerification()}
                >
                  {submitting && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                  Reenviar link de confirmação
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  className="mt-5 h-11 w-full"
                  onClick={() => {
                    setMode("login");
                    setRegistered(false);
                    setMessage("");
                    setPassword("");
                    setNotice("");
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
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">Senha</Label>
                    {mode === "login" && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setRecovering(true);
                          setPassword("");
                        }}
                        className="min-h-11 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        Esqueci minha senha
                      </button>
                    )}
                  </div>
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
                {notice && (
                  <p role="status" className="text-sm leading-5 text-muted-foreground">
                    {notice}
                  </p>
                )}
                {verificationNeeded && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting}
                    className="h-11 w-full whitespace-normal md:h-11"
                    onClick={() => void resendVerification()}
                  >
                    Reenviar link de confirmação
                  </Button>
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

            {!recovering && !registered && !verificationToken && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setMode((current) => (current === "login" ? "register" : "login"));
                  setMessage("");
                  setNotice("");
                  setVerificationNeeded(false);
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
