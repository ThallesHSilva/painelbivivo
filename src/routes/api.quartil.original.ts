import { createFileRoute } from "@tanstack/react-router";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readAuthUser } from "@/lib/auth.server";
import { getDataSnapshot } from "@/lib/snapshots.server";

export const Route = createFileRoute("/api/quartil/original")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await readAuthUser();
        if (user?.role !== "client")
          return Response.json({ message: "Acesso não autorizado." }, { status: 403 });
        const snapshot = getDataSnapshot("quartil");
        const rules = new URL(request.url).searchParams.get("type") === "rules";
        const file = rules ? snapshot.rulesFile : snapshot.originalFile;
        const directory = path.resolve(process.env.UPLOAD_PATH || ".data/uploads", "quartil");
        if (!file || path.dirname(path.resolve(file)) !== directory)
          return Response.json(
            {
              message:
                "Planilha original indisponível. Importe a base para disponibilizar o arquivo.",
            },
            { status: 404 },
          );
        try {
          const bytes = await readFile(file);
          const name =
            (rules ? snapshot.rulesSource?.report : snapshot.source.report) || "quartil.xlsx";
          return new Response(bytes, {
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": `attachment; filename="quartil.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
              "Cache-Control": "no-store",
            },
          });
        } catch {
          return Response.json(
            { message: "O arquivo original não está mais disponível." },
            { status: 404 },
          );
        }
      },
    },
  },
});
