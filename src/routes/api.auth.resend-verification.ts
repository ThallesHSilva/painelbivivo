import { createFileRoute } from "@tanstack/react-router";
import { isSameOriginRequest, verifyPassword } from "@/lib/auth.server";
import { findUserByEmail } from "@/lib/database.server";
import { EmailConfigurationError, EmailDeliveryError } from "@/lib/email.server";
import { requestEmailVerification } from "@/lib/email-verification.server";

const headers = { "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/auth/resend-verification")({
  server: {
    handlers: {
      GET: () => new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } }),
      POST: async ({ request }) => {
        if (!isSameOriginRequest(request)) {
          return Response.json(
            { message: "Origem da solicitação não permitida." },
            { status: 403, headers },
          );
        }
        const body = await request.json().catch(() => null);
        if (typeof body?.email !== "string" || typeof body?.password !== "string") {
          return Response.json(
            { message: "Informe seu e-mail e senha para reenviar o link." },
            { status: 400, headers },
          );
        }
        const user = findUserByEmail(body.email.trim().toLocaleLowerCase("pt-BR"));
        if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
          return Response.json(
            { message: "E-mail ou senha incorretos." },
            { status: 403, headers },
          );
        }
        if (user.status === "rejected") {
          return Response.json(
            { message: "Este cadastro não foi autorizado. Fale com o administrador." },
            { status: 403, headers },
          );
        }
        try {
          const result = await requestEmailVerification(user);
          if (result === "limited") {
            return Response.json(
              {
                message:
                  "Aguarde um minuto entre os envios. O limite é de 10 e-mails a cada 24 horas.",
              },
              { status: 429, headers },
            );
          }
          return Response.json(
            {
              message:
                result === "verified"
                  ? "Seu e-mail já foi confirmado. Aguarde a aprovação do administrador para entrar."
                  : "Enviamos um novo link. Confira sua caixa de entrada e o spam. O link expira em 1 hora.",
            },
            { headers },
          );
        } catch (error) {
          if (error instanceof EmailConfigurationError || error instanceof EmailDeliveryError) {
            return Response.json({ message: error.message }, { status: 503, headers });
          }
          throw error;
        }
      },
    },
  },
});
