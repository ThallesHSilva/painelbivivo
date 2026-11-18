import { createFileRoute } from "@tanstack/react-router";
import { isSameOriginRequest } from "@/lib/auth.server";
import { verifyEmailToken } from "@/lib/email-verification.server";

const headers = { "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/auth/verify-email")({
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
        if (typeof body?.token !== "string" || !verifyEmailToken(body.token)) {
          return Response.json(
            {
              message:
                "Este link expirou ou já foi utilizado. Volte para o login e solicite um novo link com seu e-mail e senha.",
            },
            { status: 400, headers },
          );
        }
        return Response.json(
          {
            verified: true,
            message: "E-mail confirmado. Entre com sua senha após a aprovação do administrador.",
          },
          { headers },
        );
      },
    },
  },
});
