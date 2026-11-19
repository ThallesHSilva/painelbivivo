import { createFileRoute } from "@tanstack/react-router";
import { isSameOriginRequest, readAuthUser } from "@/lib/auth.server";
import {
  CERTIFICATION_SCOPE_ID,
  getOperationCertificationPreview,
  saveCertificationPreview,
} from "@/lib/database.server";

export const Route = createFileRoute("/api/certificacao/previa")({
  server: {
    handlers: {
      GET: async () => {
        const user = await readAuthUser();
        if (!user || user.role === "admin") {
          return Response.json({ message: "Acesso não autorizado." }, { status: 403 });
        }
        return Response.json(
          { preview: getOperationCertificationPreview() },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      PUT: async ({ request }) => {
        const user = await readAuthUser();
        if (!user || user.role === "admin") {
          return Response.json({ message: "Acesso não autorizado." }, { status: 403 });
        }
        if (!isSameOriginRequest(request)) {
          return Response.json({ message: "Origem não permitida." }, { status: 403 });
        }
        const body = (await request.json()) as { payload?: unknown };
        if (body.payload === undefined) {
          return Response.json({ message: "Solicitação inválida." }, { status: 400 });
        }
        const serialized = JSON.stringify(body.payload);
        if (serialized.length > 250_000) {
          return Response.json({ message: "Prévia excede o tamanho permitido." }, { status: 413 });
        }
        const saved = saveCertificationPreview({
          partnerId: CERTIFICATION_SCOPE_ID,
          payload: body.payload,
          updatedBy: user.email,
        });
        return Response.json(
          { saved: true, ...saved },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
