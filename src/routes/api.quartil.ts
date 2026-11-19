import { createFileRoute } from "@tanstack/react-router";
import { readAuthUser } from "@/lib/auth.server";
import { getDataSnapshot } from "@/lib/snapshots.server";

const key = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
export const Route = createFileRoute("/api/quartil")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await readAuthUser();
        if (!user || user.role === "admin")
          return Response.json({ message: "Acesso não autorizado." }, { status: 403 });
        const snapshot = getDataSnapshot("quartil");
        const { originalFile, rulesFile, ...publicSnapshot } = snapshot;
        const known = [
          ...getDataSnapshot("mapa-parque").partners,
          ...getDataSnapshot("qsc").partners,
        ];
        const canonical = new Map(
          snapshot.partners.map((p) => [
            p.id,
            known.find((k) => key(k.name) === key(p.name) || key(k.id) === key(p.id)) ?? p,
          ]),
        );
        const requested = new URL(request.url).searchParams.getAll("partner");
        const partners = [
          ...new Map(
            snapshot.partners.map((p) => {
              const partner = canonical.get(p.id)!;
              return [partner.id, partner];
            }),
          ).values(),
        ];
        if (new URL(request.url).searchParams.has("partnersOnly")) {
          return Response.json({ partners }, { headers: { "Cache-Control": "no-store" } });
        }
        const ids = new Set(
          snapshot.partners
            .filter((p) => !requested.length || requested.includes(canonical.get(p.id)!.id))
            .map((p) => p.id),
        );
        return Response.json(
          {
            ...publicSnapshot,
            originalAvailable: Boolean(originalFile),
            rulesFileAvailable: Boolean(rulesFile),
            partners,
            // Source diagnostics may contain consultant names from other partners.
            warnings: [],
            consultants: snapshot.consultants
              .filter((c) => ids.has(c.partnerId))
              .map((c) => ({
                ...c,
                partnerId: canonical.get(c.partnerId)!.id,
                partnerName: canonical.get(c.partnerId)!.name,
              })),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
