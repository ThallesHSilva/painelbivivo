import { createFileRoute } from "@tanstack/react-router";
import { isSameOriginRequest } from "@/lib/auth.server";
import { EmailConfigurationError } from "@/lib/email.server";
import { requestPasswordReset } from "@/lib/password-reset.server";

export const Route = createFileRoute("/api/auth/forgot-password")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { message: "Método não permitido." },
          { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
        ),
      POST: async ({ request }) => {
        const headers = { "Cache-Control": "no-store" };
        if (!isSameOriginRequest(request))
          return Response.json({ message: "Origem não permitida." }, { status: 403, headers });
        let body: { email?: unknown };
        try {
          body = await request.json();
        } catch {
          return Response.json({ message: "Solicitação inválida." }, { status: 400, headers });
        }
        const email = typeof body?.email === "string" ? body.email.trim() : "";
        if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))
          return Response.json({ message: "Informe um e-mail válido." }, { status: 400, headers });
        try {
          requestPasswordReset(email);
          return Response.json(
            {
              message:
                "Se houver uma conta cadastrada com esse e-mail, você receberá um link para redefinir sua senha. Confira a caixa de entrada e o spam. O link expira em 30 minutos.",
            },
            { status: 202, headers },
          );
        } catch (error) {
          if (error instanceof EmailConfigurationError)
            return Response.json({ message: error.message }, { status: 503, headers });
          throw error;
        }
      },
    },
  },
});
