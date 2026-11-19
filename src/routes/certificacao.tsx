import { createFileRoute } from "@tanstack/react-router";
import { CertificationPanel } from "@/components/CertificationPanel";
import { DashboardLayout } from "@/layouts/DashboardLayout";

export const Route = createFileRoute("/certificacao")({
  head: () => ({ meta: [{ title: "Certificação — Mapa Parque" }] }),
  component: CertificationPage,
});

function CertificationPage() {
  return (
    <DashboardLayout title="Certificação">
      <header className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-[1.2] tracking-tight text-foreground md:text-[28px] md:leading-[34px]">
            Certificação
          </h1>
          <dl className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <dt className="font-medium text-foreground">Escopo:</dt>
              <dd>Operação</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="font-medium text-foreground">Ciclos:</dt>
              <dd>1º semestre fechado · 2º semestre em simulação</dd>
            </div>
          </dl>
        </div>
      </header>
      <CertificationPanel />
    </DashboardLayout>
  );
}
