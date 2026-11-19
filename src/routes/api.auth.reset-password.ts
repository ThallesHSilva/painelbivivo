import { createFileRoute } from "@tanstack/react-router";
import { destroyAuthSession, isSameOriginRequest, validUserPassword } from "@/lib/auth.server";
import { resetPassword } from "@/lib/password-reset.server";

export const Route = createFileRoute("/api/auth/reset-password")({
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
        let body: { token?: unknown; password?: unknown };
        try {
          body = await request.json();
        } catch {
          return Response.json({ message: "Solicitação inválida." }, { status: 400, headers });
        }
        const token = typeof body?.token === "string" ? body.token : "";
        const password = typeof body?.password === "string" ? body.password : "";
        if (!validUserPassword(password) || password.length > 256)
          return Response.json(
            { message: "Use de 8 a 256 caracteres, com maiúscula, minúscula e número." },
            { status: 400, headers },
          );
        if (!(await resetPassword(token, password)))
          return Response.json(
            {
              message:
                "Este link é inválido, expirou ou já foi utilizado. Solicite um novo link de recuperação.",
            },
            { status: 400, headers },
          );
        await destroyAuthSession();
        return Response.json(
          { message: "Senha redefinida. Entre no painel com sua nova senha." },
          { headers },
        );
      },
    },
  },
});
