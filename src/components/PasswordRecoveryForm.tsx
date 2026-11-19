import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, LoaderCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordRecoveryForm({
  token,
  initialEmail,
  onBack,
  onRequestNew,
}: {
  token: string | null;
  initialEmail: string;
  onBack: () => void;
  onRequestNew: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (token && password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        token ? "/api/auth/reset-password" : "/api/auth/forgot-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(token ? { token, password } : { email }),
        },
      );
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? "Não foi possível concluir. Tente novamente.");
        return;
      }
      setNotice(body.message ?? "Solicitação concluída.");
      setPassword("");
      setConfirmation("");
      setDone(true);
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      {done ? (
        <div className="rounded-md border border-success/25 bg-success/10 p-4" role="status">
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            {token ? (
              <CheckCircle2 aria-hidden className="size-4 shrink-0" />
            ) : (
              <Mail aria-hidden className="size-4 shrink-0" />
            )}
            {token ? "Senha atualizada" : "Confira seu e-mail"}
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground">{notice}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            {token
              ? "Escolha uma nova senha para sua conta. Após salvar, entre novamente no painel."
              : "Informe o e-mail da sua conta para receber um link de recuperação."}
          </p>
          {token ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    name="new-password"
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={256}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby="password-requirements"
                    className="h-11 bg-background pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setVisible(!visible)}
                    aria-label={visible ? "Ocultar nova senha" : "Mostrar nova senha"}
                    className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-md text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {visible ? (
                      <EyeOff aria-hidden className="size-4" />
                    ) : (
                      <Eye aria-hidden className="size-4" />
                    )}
                  </button>
                </div>
                <p id="password-requirements" className="text-xs leading-5 text-muted-foreground">
                  Mínimo de 8 caracteres, com maiúscula, minúscula e número.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input
                  id="confirm-password"
                  name="confirm-password"
                  type={visible ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={256}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className="h-11 bg-background"
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="recovery-email">E-mail cadastrado</Label>
              <Input
                id="recovery-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@empresa.com.br"
                className="h-11 bg-background"
              />
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm leading-5 text-destructive"
            >
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="h-11 w-full justify-between px-4">
            {busy ? "Enviando..." : token ? "Salvar nova senha" : "Enviar link de recuperação"}
            {busy ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
            ) : (
              <ArrowRight aria-hidden className="size-4" />
            )}
          </Button>
          {token && error && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="h-11 w-full"
              onClick={onRequestNew}
            >
              Solicitar novo link
            </Button>
          )}
        </form>
      )}
      {done && !token && (
        <p className="text-xs leading-5 text-muted-foreground">
          Não recebeu? Aguarde um minuto e solicite um novo link. Use sempre o e-mail cadastrado.
        </p>
      )}
      <Button
        type="button"
        variant={done && token ? "default" : "ghost"}
        disabled={busy}
        onClick={onBack}
        className="h-11 w-full"
      >
        <ArrowLeft aria-hidden className="size-4" /> Voltar para o login
      </Button>
    </div>
  );
}
