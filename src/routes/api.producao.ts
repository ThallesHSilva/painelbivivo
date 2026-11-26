import { createFileRoute } from "@tanstack/react-router";
import { readAuthUser } from "@/lib/auth.server";
import { currentProductionMonth, loadProduction } from "@/lib/production.server";

export const Route = createFileRoute("/api/producao")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await readAuthUser();
        if (!user || user.role === "admin")
          return Response.json({ message: "Acesso não autorizado." }, { status: 403 });
        const month = new URL(request.url).searchParams.get("month") ?? currentProductionMonth();
        if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))
          return Response.json({ message: "Mês inválido." }, { status: 400 });
        try {
          return Response.json(await loadProduction(month), {
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          return Response.json(
            {
              message:
                error instanceof Error ? error.message : "Não foi possível consultar a produção.",
            },
            { status: 502, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
