import { loadCertificationPreview } from "@/lib/certification-client";
import { useInvasaoTickets } from "@/hooks/useInvasaoTickets";
import {
  invasaoReportPages,
  opportunitiesReportPages,
  certificationReportPages,
} from "@/components/ExecutiveReportSupplements";
import { qscSemesterValues } from "@/lib/qsc-domain-history";
import type { InvasaoSnapshot } from "@/lib/invasao";
import { reportChunks } from "@/lib/report-data";
import { ExecutiveReportDocument, useReportPagination } from "@/components/ExecutiveReportDocument";
import {
  ReportPage,
  SectionTitle,
  MetricCard,
  HeroMetric,
  LargeSummary,
  CompactTable,
} from "@/components/ExecutiveReportPrimitives";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Gauge,
  MapPin,
  Minus,
  ShieldCheck,
  Smartphone,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { usePartnerFilter } from "@/contexts/AppContexts";
import { useAdvanced, useFtth, useLicenses, useMobile, usePartners, useQsc } from "@/hooks/useData";
import { fmtBRL, fmtBRLCompact, fmtInt, fmtPct, fmtQscPct } from "@/lib/format";
import {
  FTTH_SIMULATOR_STORAGE_KEY,
  MOBILE_SIMULATOR_STORAGE_KEY,
  readSavedConversionParams,
  simulateConversion,
} from "@/lib/opportunity-simulation";
import { QUARTIL_METRICS, QUARTIL_LABELS, quartilEvolutionCounts } from "@/lib/quartil";
import type { QscDomain } from "@/lib/qsc";
import { formatQscDeltaPp, qscVariation, qscWorsened, shortCompetence } from "@/lib/qsc-variation";
import type { QuartilConsultant, QuartilMetric, QuartilSnapshot } from "@/lib/quartil";

const QUARTIL_REPORT_METRICS = QUARTIL_METRICS.map((id) => ({ id, label: QUARTIL_LABELS[id] }));
const QUARTIL_REPORT_COLORS = ["#15803d", "#65a30d", "#eab308", "#f97316", "#dc2626"] as const;

const PULSE_METRICS = [
  { id: "early-churn-fixa", label: "Early Churn Fixa" },
  { id: "early-churn-movel", label: "Early Churn Móvel" },
  { id: "churn-bl", label: "Churn Fixa" },
  { id: "churn-movel", label: "Churn Móvel" },
  { id: "saldo-portabilidade", label: "Saldo de Portabilidade" },
] as const;

const DOMAIN_LABELS: Array<{ domain: QscDomain; label: string }> = [
  { domain: "carteira", label: "QSC Carteira" },
  { domain: "fixa", label: "QSC Fixa" },
  { domain: "movel", label: "QSC Móvel" },
];

export const Route = createFileRoute("/relatorio-executivo")({
  head: () => ({ meta: [{ title: "Relatório executivo — Mapa Parque" }] }),
  component: ExecutiveReportPage,
});

type QuartilPartnerDistribution = {
  partner: string;
  consultants: number;
  quartiles: [number, number, number, number, number];
  missing: number;
};

function quartilDistribution(
  snapshot: QuartilSnapshot | null,
  metric: QuartilMetric,
): QuartilPartnerDistribution[] {
  if (!snapshot) return [];
  const grouped = new Map<string, QuartilPartnerDistribution>();
  for (const consultant of snapshot.consultants) {
    const current = grouped.get(consultant.partnerName) ?? {
      partner: consultant.partnerName,
      consultants: 0,
      quartiles: [0, 0, 0, 0, 0],
      missing: 0,
    };
    current.consultants += 1;
    const quartile = consultant.quartiles[metric];
    if (quartile == null) current.missing += 1;
    else current.quartiles[quartile - 1] += 1;
    grouped.set(consultant.partnerName, current);
  }
  return [...grouped.values()].sort((left, right) => left.partner.localeCompare(right.partner));
}

function monthLabel(month: number) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(new Date(2026, month - 1, 1))
    .replace(".", "");
}

function competenceLabel(competence?: string) {
  if (!competence) return "Sem competência";
  const [year, month] = competence.split("-").map(Number);
  if (!year || !month) return competence;
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );
}

function semesterCompetencies(competence: string) {
  const year = Number(competence.slice(0, 4)) || new Date().getFullYear();
  const month = Number(competence.slice(5, 7)) || new Date().getMonth() + 1;
  const firstMonth = month <= 6 ? 1 : 7;
  return Array.from(
    { length: 6 },
    (_, index) => `${year}-${String(firstMonth + index).padStart(2, "0")}`,
  );
}

function qscRating(total: number | null) {
  if (total == null) return { band: "—", points: null };
  if (total >= 90) return { band: "Faixa 5", points: 1000 };
  if (total >= 80) return { band: "Faixa 4", points: 800 };
  if (total >= 70) return { band: "Faixa 3", points: 600 };
  if (total >= 60) return { band: "Faixa 2", points: 400 };
  if (total >= 50) return { band: "Faixa 1", points: 200 };
  return { band: "Sem faixa", points: 0 };
}

function ExecutiveReportPage() {
  const { selected, role } = usePartnerFilter();
  const { data: partners = [], isPending: partnersLoading } = usePartners();
  const { data: mobile, isLoading: mobileLoading } = useMobile();
  const { data: ftth, isLoading: ftthLoading } = useFtth();
  const { data: qsc, isLoading: qscLoading } = useQsc();
  const licensesQuery = useLicenses();
  const advancedQuery = useAdvanced();
  const scopeQuery = new URLSearchParams();
  selected.forEach((partner) => scopeQuery.append("partner", partner));
  const ready = role === "client";
  const quartilQuery = useQuery({
    queryKey: ["report-quartil", selected],
    enabled: ready,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/quartil?${scopeQuery}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Quartil indisponível.");
      return response.json() as Promise<QuartilSnapshot>;
    },
  });
  const invasaoQuery = useQuery({
    queryKey: ["invasao", selected],
    enabled: ready,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/invasao?${scopeQuery}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("Invasão de Carteira indisponível.");
      return response.json() as Promise<InvasaoSnapshot>;
    },
  });
  const invasaoTickets = useInvasaoTickets(!!invasaoQuery.data?.months.length);
  const certificationQuery = useQuery({
    queryKey: ["certification-preview", "operation"],
    enabled: ready,
    retry: false,
    queryFn: ({ signal }) => loadCertificationPreview(signal),
  });
  const quartil = quartilQuery.data ?? null;

  const selectedNames = useMemo(
    () => selected.map((id) => partners.find((partner) => partner.id === id)?.name ?? id),
    [selected, partners],
  );
  const partnerLabel = selectedNames.length
    ? selectedNames.length === 1
      ? selectedNames[0]
      : `${selectedNames.length} parceiros selecionados`
    : "Todos os parceiros";

  const mobileConversionParams = useMemo(
    () => readSavedConversionParams(MOBILE_SIMULATOR_STORAGE_KEY),
    [],
  );
  const mobileConversion = useMemo(
    () =>
      simulateConversion(
        (mobile?.porParceiro ?? []).map((partner) => ({
          parceiro: partner.parceiro,
          oportunidades: partner.baseRecMovel,
        })),
        mobileConversionParams,
      ),
    [mobile, mobileConversionParams],
  );

  const ftthConversionParams = useMemo(
    () => readSavedConversionParams(FTTH_SIMULATOR_STORAGE_KEY),
    [],
  );
  const ftthConversion = useMemo(
    () =>
      simulateConversion(
        (ftth?.porParceiro ?? []).map((partner) => ({
          parceiro: partner.parceiro,
          oportunidades: partner.oportunidades,
        })),
        ftthConversionParams,
      ),
    [ftth, ftthConversionParams],
  );
  const ftthCities = useMemo(
    () =>
      [...(ftth?.geo ?? [])]
        .map((city) => ({
          cidade: String(city.cidade),
          oportunidades: Number(city.oportunidades) || 0,
        }))
        .sort((left, right) => right.oportunidades - left.oportunidades),
    [ftth],
  );

  const reportDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const isLoading =
    !ready ||
    partnersLoading ||
    mobileLoading ||
    ftthLoading ||
    qscLoading ||
    licensesQuery.isPending ||
    advancedQuery.isPending ||
    quartilQuery.isPending ||
    invasaoQuery.isPending ||
    !invasaoTickets.isReady ||
    certificationQuery.isPending;
  const meta = { partner: partnerLabel, date: reportDate };

  if (isLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-6">
        <div className="text-center">
          <div className="mx-auto size-10 animate-spin rounded-full border-4 border-violet-200 border-t-violet-700" />
          <p className="mt-4 text-sm font-medium text-slate-600">Preparando o resumo executivo…</p>
        </div>
      </main>
    );
  }

  return (
    <ExecutiveReportDocument partner={partnerLabel}>
      <CoverReportPage partner={partnerLabel} date={reportDate} />

      <ChapterCoverPage
        id="capitulo-certificacao"
        number="01"
        eyebrow="Certificação da operação"
        title="Certificação"
        description="Simulação salva do ciclo atual da operação."
        partner={partnerLabel}
        date={reportDate}
        tone="violet"
      />
      {certificationReportPages(
        certificationQuery.data?.preview?.payload,
        certificationQuery.data?.preview?.updatedAt,
        certificationQuery.isError ? "error" : "operation",
        meta,
      )}

      <ChapterCoverPage
        id="capitulo-oportunidades"
        number="02"
        eyebrow="Potencial comercial"
        title="Oportunidades"
        description="Invasão de Carteira, Móvel, FTTH, Licenças e Avançada no mesmo recorte de parceiros."
        partner={partnerLabel}
        date={reportDate}
        tone="fuchsia"
      />

      {invasaoReportPages(invasaoQuery.data, meta, invasaoTickets.tickets, invasaoTickets.warning)}
      <ReportPage
        title="Oportunidades Móvel"
        eyebrow="Portfólio móvel"
        partner={partnerLabel}
        date={reportDate}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 print:grid-cols-4">
          <HeroMetric label="Oportunidade móvel" value={fmtInt(mobile?.kpis.baseRecMovel)} />
          <HeroMetric
            label="Aquisição móvel"
            value={fmtInt(mobile?.kpis.aquisicaoMovel)}
            tone="sky"
          />
          <HeroMetric
            label="Renovação FTTH + totalização"
            value={fmtInt(mobile?.kpis.renovacaoFtthTotalizacao)}
            tone="violet"
          />
          <HeroMetric label="Posse" value={fmtInt(mobile?.kpis.posse)} tone="sky" />
        </div>
        <section className="mt-5">
          <SectionTitle
            icon={<Smartphone className="size-4" />}
            eyebrow="Pré-aprovação de crédito"
            title="Oportunidades de aparelhos"
          />
          <div className="mt-3 grid grid-cols-4 gap-3">
            <MetricCard
              label="Oportunidades"
              value={fmtInt(mobile?.kpis.oportunidadesAparelhos)}
              accent="violet"
            />
            <MetricCard label="iPhone" value={fmtInt(mobile?.kpis.aparelhosIphone)} />
            <MetricCard label="Galaxy S/Fold" value={fmtInt(mobile?.kpis.aparelhosGalaxyPremium)} />
            <MetricCard label="Outros aparelhos" value={fmtInt(mobile?.kpis.aparelhosOutros)} />
          </div>
        </section>
        <div className="mt-5 grid grid-cols-3 gap-4">
          <LargeSummary
            label="Crédito de aparelho"
            value={fmtBRLCompact(mobile?.kpis.creditoAparelhos)}
          />
          <LargeSummary
            label="Renovação móvel + aparelho"
            value={fmtInt(mobile?.kpis.renovacaoMovelComAparelho)}
            tone="violet"
          />
          <LargeSummary
            label="Aparelho sem renovação"
            value={fmtInt(mobile?.kpis.aparelhoSemRenovacao)}
            tone="sky"
          />
        </div>
        <section className="mt-5">
          <SectionTitle
            icon={<Gauge className="size-4" />}
            eyebrow="Simulador móvel"
            title="Conversão por parceiro"
          />
          <CompactTable
            dense
            headers={[
              "Parceiro",
              "Oportunidade Móvel",
              "Linhas",
              "Conversão",
              "PDU",
              "Receita móvel",
            ]}
            rows={mobileConversion.simulation.map((row) => [
              row.parceiro,
              fmtInt(row.oportunidades),
              fmtInt(row.quantity),
              fmtInt(row.conversions),
              fmtInt(row.capacity),
              fmtBRL(row.revenue),
            ])}
            total={[
              "Total",
              fmtInt(mobileConversion.total.oportunidades),
              fmtInt(mobileConversion.total.quantity),
              fmtInt(mobileConversion.total.conversions),
              fmtInt(mobileConversion.total.capacity),
              fmtBRL(mobileConversion.total.revenue),
            ]}
            empty="Nenhum parceiro no recorte."
          />
          <p className="mt-2 text-[10px] leading-4 text-slate-500">
            Cenário com os parâmetros individuais de cada parceiro (linhas por CNPJ, conversão, dias
            úteis e ticket médio) salvos neste navegador no simulador móvel.
          </p>
        </section>
      </ReportPage>

      <ReportPage
        title="Oportunidades FTTH"
        eyebrow="Conectividade FTTH"
        partner={partnerLabel}
        date={reportDate}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
          <HeroMetric label="Aquisição Fixa Básica" value={fmtInt(ftth?.kpis.oportunidades)} />
          <HeroMetric label="Posse" value={fmtInt(ftth?.kpis.posse)} tone="sky" />
        </div>
        <section className="mt-5">
          <SectionTitle
            icon={<Gauge className="size-4" />}
            eyebrow="Simulador FTTH"
            title="Conversão por parceiro"
          />
          <CompactTable
            dense
            headers={[
              "Parceiro",
              "Aquisição Fixa Básica",
              "BLs",
              "Conversão",
              "PDU",
              "Receita FTTH",
            ]}
            rows={ftthConversion.simulation.map((row) => [
              row.parceiro,
              fmtInt(row.oportunidades),
              fmtInt(row.quantity),
              fmtInt(row.conversions),
              fmtInt(row.capacity),
              fmtBRL(row.revenue),
            ])}
            total={[
              "Total",
              fmtInt(ftthConversion.total.oportunidades),
              fmtInt(ftthConversion.total.quantity),
              fmtInt(ftthConversion.total.conversions),
              fmtInt(ftthConversion.total.capacity),
              fmtBRL(ftthConversion.total.revenue),
            ]}
            empty="Nenhum parceiro no recorte."
          />
          <p className="mt-2 text-[10px] leading-4 text-slate-500">
            Cenário com os parâmetros individuais de cada parceiro (BLs por CNPJ, conversão, dias
            úteis e ticket médio) salvos neste navegador no simulador FTTH.
          </p>
        </section>
        <section className="mt-5">
          <SectionTitle
            icon={<MapPin className="size-4" />}
            eyebrow="Distribuição geográfica"
            title="Oportunidade por cidade"
          />
          <CityBars cities={ftthCities} limit={10} />
        </section>
      </ReportPage>

      {opportunitiesReportPages(licensesQuery.data, advancedQuery.data, meta)}

      <ChapterCoverPage
        id="capitulo-qsc"
        number="03"
        eyebrow="Qualidade e execução"
        title="QSC"
        description="Síntese histórica e indicadores críticos para acompanhar qualidade, execução e pontos de atenção."
        partner={partnerLabel}
        date={reportDate}
        tone="emerald"
      />

      {qscReportPages({ qsc, partner: partnerLabel, date: reportDate })}

      <ChapterCoverPage
        id="capitulo-quartil"
        number="04"
        eyebrow="Performance comercial"
        title="Quartil de consultores"
        description="Distribuição dos consultores por parceiro e por faixa de desempenho em Receita, Móvel e FTTH."
        partner={partnerLabel}
        date={reportDate}
        tone="violet"
      />

      <QuartilOverviewReportPage quartil={quartil} partner={partnerLabel} date={reportDate} />
    </ExecutiveReportDocument>
  );
}

/**
 * Barras em HTML/CSS em vez de gráfico responsivo: na impressão a largura é fixa e
 * não depende de medição do contêiner, então a folha sai igual à tela.
 */
function CityBars({
  cities,
  limit,
}: {
  cities: Array<{ cidade: string; oportunidades: number }>;
  limit: number;
}) {
  if (!cities.length) {
    return (
      <p className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-6 text-center text-[10px] text-slate-500">
        A base não retornou cidades com oportunidade para este recorte.
      </p>
    );
  }
  const visible = cities.slice(0, limit);
  const max = Math.max(...visible.map((city) => city.oportunidades), 1);
  return (
    <>
      <ul className="mt-3 space-y-1.5">
        {visible.map((city) => (
          <li key={city.cidade} className="grid grid-cols-[150px_1fr_64px] items-center gap-3">
            <span className="truncate text-[10px] font-semibold text-slate-800">{city.cidade}</span>
            <span className="h-3 rounded-sm bg-violet-50">
              <span
                className="block h-3 rounded-sm bg-violet-600"
                style={{ width: `${(city.oportunidades / max) * 100}%` }}
              />
            </span>
            <span className="text-right text-[10px] font-bold tabular-nums text-slate-900">
              {fmtInt(city.oportunidades)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">
        {cities.length > limit
          ? `${limit} cidades com maior oportunidade, de ${fmtInt(cities.length)}. Valores em CNPJs.`
          : `${fmtInt(cities.length)} ${cities.length === 1 ? "cidade" : "cidades"} com oportunidade. Valores em CNPJs.`}
      </p>
    </>
  );
}

function CoverReportPage({ partner, date }: { partner: string; date: string }) {
  const { page, totalPages } = useReportPagination();
  return (
    <article
      id="inicio-relatorio"
      className="executive-report-page relative mx-auto mb-6 flex min-h-[790px] max-w-[1120px] scroll-mt-24 flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#24033b] via-[#4b0a78] to-[#7b117b] p-10 text-white shadow-2xl"
    >
      <div className="absolute -right-28 -top-32 size-[28rem] rounded-full bg-cyan-300/25 blur-3xl" />
      <div className="absolute -bottom-44 -left-36 size-[30rem] rounded-full bg-fuchsia-400/20 blur-3xl" />
      <div className="absolute right-16 top-32 size-52 rounded-full border border-violet-200/20 bg-violet-300/10" />

      <header className="relative flex justify-end border-b border-white/15 pb-5">
        <p className="text-xs font-semibold text-white/80">{date}</p>
      </header>

      <div className="relative flex flex-1 items-center">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-200">
            Resumo do parceiro
          </p>
          <h1 className="mt-5 text-3xl font-semibold sm:text-6xl print:text-6xl leading-[0.98] tracking-[-0.05em]">
            Relatório
            <br />
            executivo
          </h1>
          <p className="mt-6 text-2xl font-medium text-white/90">{partner}</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-violet-100">
            Certificação, oportunidades, indicadores de qualidade e desempenho dos consultores.
          </p>

          <div className="mt-9 grid max-w-2xl grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3">
            {[
              ["Certificação", "Simulação salva da operação", "#capitulo-certificacao"],
              ["Oportunidades", "Invasão, Móvel, FTTH, TI e Avançada", "#capitulo-oportunidades"],
              ["QSC", "Qualidade e execução", "#capitulo-qsc"],
              ["Quartil", "Faixas e cinco indicadores comerciais", "#capitulo-quartil"],
            ].map(([title, subtitle, href], index) => (
              <a
                key={title}
                href={href}
                className="group flex items-center gap-3 rounded-2xl border border-violet-200/25 bg-[#3f1763]/90 px-4 py-3 text-white transition hover:-translate-y-0.5 hover:border-cyan-200/70 hover:bg-[#54207b] focus:outline-none focus:ring-2 focus:ring-cyan-200"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/10 text-[10px] font-bold text-cyan-100 ring-1 ring-white/15">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="block text-xs font-semibold">{title}</span>
                  <span className="mt-0.5 block text-[9px] text-violet-100/80">{subtitle}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>

      <footer className="relative flex items-center justify-between border-t border-white/15 pt-4 text-[10px] text-white/60">
        <span>Material confidencial · uso executivo</span>
        <span>
          Página {page} de {totalPages}
        </span>
      </footer>
    </article>
  );
}

function ChapterCoverPage({
  id,
  number,
  eyebrow,
  title,
  partner,
  date,
  tone,
}: {
  id: string;
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  partner: string;
  date: string;
  tone: "violet" | "sky" | "fuchsia" | "emerald";
}) {
  const tones = {
    violet: "from-[#24033b] via-[#4b0a78] to-[#6f1588] text-violet-100",
    sky: "from-[#061d32] via-[#083d5c] to-[#076a8b] text-cyan-100",
    fuchsia: "from-[#2b062d] via-[#651056] to-[#97136e] text-fuchsia-100",
    emerald: "from-[#06251f] via-[#0b4d3e] to-[#08765c] text-emerald-100",
  } as const;

  const { page, totalPages } = useReportPagination();
  return (
    <article
      id={id}
      className={`executive-report-page relative mx-auto mb-6 flex min-h-[790px] max-w-[1120px] scroll-mt-24 flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br p-10 text-white shadow-2xl ${tones[tone]}`}
    >
      <div className="absolute -right-32 -top-32 size-[30rem] rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-36 -left-28 size-[28rem] rounded-full bg-white/[0.06] blur-2xl" />
      <header className="relative flex items-center justify-between border-b border-white/15 pb-5 text-xs">
        <span className="font-semibold text-white/85">{partner}</span>
        <span className="text-white/65">{date}</span>
      </header>

      <div className="relative flex flex-1 items-center">
        <div className="max-w-3xl">
          <div className="mb-8 flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-2xl border border-white/20 bg-white/10 text-xl font-semibold">
              {number}
            </span>
            <p className="text-xs font-bold uppercase tracking-[0.28em]">{eyebrow}</p>
          </div>
          <h1 className="max-w-4xl text-3xl font-semibold sm:text-6xl print:text-6xl leading-[0.98] tracking-[-0.05em]">
            {title}
          </h1>
        </div>
      </div>

      <footer className="relative flex items-center justify-between border-t border-white/15 pt-4 text-[10px] text-white/60">
        <a href="#inicio-relatorio" className="transition hover:text-white">
          Voltar à capa
        </a>
        <span>
          Página {page} de {totalPages}
        </span>
      </footer>
    </article>
  );
}

function qscReportPages({
  qsc,
  partner,
  date,
}: {
  qsc: ReturnType<typeof useQsc>["data"];
  partner: string;
  date: string;
}) {
  const competence = qsc?.competence ?? "";
  const metrics = qsc?.metrics ?? [];
  const competencies = semesterCompetencies(competence);
  const rows = DOMAIN_LABELS.map((item) => ({
    ...item,
    ...qscSemesterValues(
      item.domain,
      qsc?.domainHistoryUnavailable ? undefined : qsc?.domainHistory,
      competencies,
    ),
  }));
  const pulse = PULSE_METRICS.flatMap((item) => {
    const metric = metrics.find((candidate) => candidate.id === item.id);
    return metric ? [{ ...item, metric }] : [];
  });
  // Mês fechado de cada indicador (competência mais recente com apuração) contra o mês
  // imediatamente anterior a ele.
  const worsened = qscWorsened(metrics);
  const comparable = metrics.filter((metric) => qscVariation(metric).status !== "unavailable");
  const notComparable = metrics.length - comparable.length;
  const dropPages = reportChunks(worsened, 12);

  return [
    <ReportPage
      key="qsc-main"
      title="Qualidade e execução"
      eyebrow="QSC"
      partner={partner}
      date={date}
    >
      <section className="rounded-[1.4rem] border border-violet-100 bg-white p-5 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <SectionTitle
            icon={<ShieldCheck className="size-4" />}
            eyebrow="Histórico consolidado"
            title="Nota consolidada por semestre"
          />
          <span className="rounded-full bg-violet-50 px-3 py-1 text-[10px] font-semibold capitalize text-violet-700">
            {competenceLabel(competence)}
          </span>
        </div>
        {(!qsc || qsc.domainHistoryUnavailable || !qsc.domainHistory) && (
          <p className="mt-3 text-xs text-slate-600">
            Histórico semestral indisponível. Nenhuma soma antiga de indicadores foi usada como
            substituição.
          </p>
        )}
        <p className="mt-2 text-[10px] text-slate-500">
          Média das notas consolidadas por parceiro em cada mês; totalizador pela média dos meses
          com apuração.
        </p>
        <CompactTable
          headers={[
            "Indicador",
            ...competencies.map((item) => monthLabel(Number(item.slice(5, 7)))),
            "Totalizador",
            "Pts",
            "Faixa",
          ]}
          rows={rows.map((row) => [
            row.label,
            ...row.values.map(fmtInt),
            fmtInt(row.totalizer),
            fmtInt(qscRating(row.totalizer).points),
            qscRating(row.totalizer).band,
          ])}
        />
      </section>

      <section className="mt-5">
        <SectionTitle
          icon={<Gauge className="size-4" />}
          eyebrow="Indicadores críticos"
          title="Pulso do mês"
        />
        <div className="mt-3 grid grid-cols-5 gap-3">
          {pulse.map(({ id, label, metric }) => {
            const variation = qscVariation(metric);
            const worse = variation.status === "worse";
            return (
              <div
                key={id}
                className={`rounded-[1.25rem] border bg-white p-4 shadow-sm ${worse ? "border-rose-300 ring-1 ring-rose-200" : "border-slate-200"}`}
              >
                <p className="min-h-7 text-[9px] font-bold uppercase leading-3 tracking-[0.12em] text-slate-500">
                  {label}
                </p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <strong className="text-xl tabular-nums text-slate-950">
                    {fmtQscPct(metric.latest?.value)}
                  </strong>
                  <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-bold text-violet-700">
                    F{metric.latest?.scoreBand ?? "—"}
                  </span>
                </div>
                <div className="mt-3 flex justify-between border-t border-slate-100 pt-2 text-[9px] text-slate-500">
                  <span>Nota {metric.latest?.score ?? "—"}</span>
                  <span>
                    {fmtInt(metric.latest?.numerator)} / {fmtInt(metric.latest?.denominator)}
                  </span>
                </div>
                <p
                  className={`mt-2 flex items-center gap-1 text-[9px] font-bold ${worse ? "text-rose-700" : "text-slate-500"}`}
                >
                  {variation.status === "worse" ? (
                    <TrendingDown className="size-3" aria-hidden />
                  ) : variation.status === "better" ? (
                    <TrendingUp className="size-3" aria-hidden />
                  ) : (
                    <Minus className="size-3" aria-hidden />
                  )}
                  {variation.status === "unavailable" || !variation.current || !variation.previous
                    ? "Sem mês anterior para comparar"
                    : `${
                        variation.status === "worse"
                          ? "Piorou"
                          : variation.status === "better"
                            ? "Melhorou"
                            : "Estável"
                      } ${formatQscDeltaPp(variation.deltaPp)} · ${shortCompetence(variation.current.competence)} vs ${shortCompetence(variation.previous.competence)}`}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </ReportPage>,
    ...dropPages.map((rows, index) => (
      <ReportPage
        key={`qsc-drops-${index}`}
        title={`Indicadores em queda${dropPages.length > 1 ? ` · ${index + 1}/${dropPages.length}` : ""}`}
        eyebrow="QSC · Mês fechado × mês anterior"
        partner={partner}
        date={date}
      >
        <p className="text-xs text-slate-600">
          Cada indicador no seu mês fechado (a competência mais recente com apuração) contra o mês
          imediatamente anterior. Competência mais recente da base:{" "}
          <span className="capitalize">{competenceLabel(competence)}</span>.
        </p>
        <p className="mt-1 text-[10px] leading-4 text-slate-500">
          Queda é a piora do indicador: valor menor quando subir é favorável, valor maior quando
          descer é favorável (ex.: churn). Variação em pontos percentuais, do maior recuo para o
          menor.
        </p>
        <CompactTable
          headers={[
            "Indicador",
            "Sentido favorável",
            "Competência",
            "Mês anterior",
            "Mês fechado",
            "Variação",
            "Faixa",
          ]}
          rows={rows.map(({ metric, variation }) => [
            metric.label,
            metric.favorableDirection === "up" ? "Maior é melhor" : "Menor é melhor",
            `${shortCompetence(variation.current?.competence ?? "")} × ${shortCompetence(variation.previous?.competence ?? "")}`,
            fmtQscPct(variation.previous?.value),
            fmtQscPct(variation.current?.value),
            formatQscDeltaPp(variation.deltaPp),
            `F${variation.previous?.scoreBand ?? "—"} → F${variation.current?.scoreBand ?? "—"}`,
          ])}
          empty={
            comparable.length
              ? "Nenhum indicador piorou em relação ao mês anterior."
              : "Sem mês anterior apurado na base para comparar os indicadores."
          }
        />
        {index === dropPages.length - 1 && notComparable > 0 && (
          <p className="mt-3 text-[10px] leading-4 text-slate-500">
            {notComparable} {notComparable === 1 ? "indicador" : "indicadores"} sem o mês anterior
            apurado ficaram fora da comparação; ausência de dado não é queda.
          </p>
        )}
      </ReportPage>
    )),
  ];
}

function QuartilDistributionBar({
  bands,
  total,
  missing = 0,
  className = "",
}: {
  bands: [number, number, number, number, number];
  total: number;
  missing?: number;
  className?: string;
}) {
  return (
    <div
      className={`quartil-report-bar flex h-5 overflow-hidden rounded-md bg-muted ${className}`}
      aria-label={`Distribuição: ${bands.map((value, index) => `Q${index + 1} ${value}`).join(", ")}`}
    >
      {bands.map((value, index) => (
        <div
          key={index}
          className={`quartil-fill-q${index + 1}`}
          style={{
            width: total ? `${(value / total) * 100}%` : "0%",
            backgroundColor: QUARTIL_REPORT_COLORS[index],
          }}
        />
      ))}
      <div
        className="bg-slate-300"
        style={{ width: total ? `${(missing / total) * 100}%` : "0%" }}
      />
    </div>
  );
}

function QuartilDistributionLegend({
  bands,
  missing,
  total,
  stacked = false,
}: {
  bands: [number, number, number, number, number];
  missing: number;
  total: number;
  /** Rótulo sobre o valor, centralizado: cabe em colunas estreitas sem sobrepor itens. */
  stacked?: boolean;
}) {
  const items = [
    ...bands.map((value, index) => ({
      label: `Q${index + 1}`,
      value,
      color: QUARTIL_REPORT_COLORS[index],
    })),
    { label: "Sem Q", value: missing, color: "#cbd5e1" },
  ];
  if (stacked) {
    return (
      <div className="mt-2 grid grid-cols-6 gap-1">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col items-center text-[9px] leading-3">
            <span className="flex items-center gap-1 font-semibold text-slate-700">
              <span
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
            <span className="tabular-nums text-slate-700">
              {fmtInt(item.value)}{" "}
              <span className="text-slate-400">{total ? fmtPct(item.value / total) : "—"}</span>
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 sm:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-[9px] text-slate-600">
          <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
          <span className="font-semibold">{item.label}</span>
          <span className="tabular-nums">{fmtInt(item.value)}</span>
          <span className="text-slate-400">{total ? fmtPct(item.value / total) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function QuartilEvolutionCard({
  consultants,
  metric,
  period,
  latestMonth,
}: {
  consultants: QuartilConsultant[];
  metric: (typeof QUARTIL_REPORT_METRICS)[number];
  period: "3" | "6";
  latestMonth: string;
}) {
  const counts = quartilEvolutionCounts(consultants, metric.id, period);
  // A janela parte do mês corrente da base, não de um parceiro com competência atrasada.
  const reference = consultants.find((item) => item.month === latestMonth) ?? consultants[0];
  const before = reference?.comparisons[period].month;
  const tiles = [
    { label: "Evoluiu", value: counts.up, color: "text-emerald-700" },
    { label: "Regrediu", value: counts.down, color: "text-red-600" },
    { label: "Neutro", value: counts.stable, color: "text-slate-900" },
  ];
  const tileClass = "rounded-lg border border-violet-100 bg-violet-50/70 px-2 py-1";
  return (
    <div className="quartil-overview-evolution flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50/80 px-2.5 py-1.5">
        <p className="text-[10px] font-semibold text-slate-800">
          Evolução em {period} meses · {metric.label}
        </p>
        <p className="text-[8px] text-slate-400">
          {before
            ? `${competenceLabel(before)} → ${competenceLabel(latestMonth)}`
            : "Sem histórico"}
        </p>
      </div>
      <div className="grid flex-1 grid-cols-3 content-start gap-1.5 p-2">
        {tiles.map((tile) => (
          <div key={tile.label} className={tileClass}>
            <p className={`text-base font-semibold leading-5 tabular-nums ${tile.color}`}>
              {fmtInt(tile.value)}
            </p>
            <p className="text-[8px] text-slate-500">{tile.label}</p>
          </div>
        ))}
        <div className={`${tileClass} col-span-3 flex items-center gap-2`}>
          <p className="text-base font-semibold leading-5 tabular-nums text-red-600">
            {fmtInt(counts.alert)}
          </p>
          <div>
            <p className="text-[8px] leading-3 text-slate-500">Alerta</p>
            <p className="text-[7px] leading-[9px] text-slate-400">{QUARTIL_ALERT_RULE}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const QUARTIL_ALERT_RULE = "4 registros seguidos com algum indicador em Q5";
/** Linhas de parceiro por métrica no slide único; o excedente é somado numa linha "Demais". */
const QUARTIL_OVERVIEW_PARTNER_ROWS = 3;

function sumQuartilRows(rows: QuartilPartnerDistribution[], partner: string) {
  return rows.reduce<QuartilPartnerDistribution>(
    (summary, row) => ({
      partner,
      consultants: summary.consultants + row.consultants,
      quartiles: summary.quartiles.map((value, index) => value + row.quartiles[index]) as [
        number,
        number,
        number,
        number,
        number,
      ],
      missing: summary.missing + row.missing,
    }),
    { partner, consultants: 0, quartiles: [0, 0, 0, 0, 0], missing: 0 },
  );
}

/** Mantém os maiores parceiros e agrega o resto, para o total do slide continuar fechando. */
function quartilOverviewRows(rows: QuartilPartnerDistribution[]) {
  if (rows.length <= QUARTIL_OVERVIEW_PARTNER_ROWS) return rows;
  const ranked = [...rows].sort(
    (left, right) =>
      right.consultants - left.consultants || left.partner.localeCompare(right.partner),
  );
  const shown = ranked.slice(0, QUARTIL_OVERVIEW_PARTNER_ROWS - 1);
  const rest = ranked.slice(QUARTIL_OVERVIEW_PARTNER_ROWS - 1);
  return [...shown, sumQuartilRows(rest, `Demais ${rest.length} parceiros`)];
}

/** Tabela por parceiro do slide único. O total já está na barra e na legenda acima dela. */
function QuartilOverviewTable({ rows }: { rows: QuartilPartnerDistribution[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full table-fixed border-collapse text-[8px]">
        <colgroup>
          <col className="w-[27%]" />
          <col className="w-[12%]" />
          <col className="w-[19%]" />
          {[1, 2, 3, 4, 5].map((band) => (
            <col key={band} className="w-[6.5%]" />
          ))}
          <col className="w-[9.5%]" />
        </colgroup>
        <thead className="bg-slate-50 text-[7px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-1.5 py-0.5 text-left font-bold">Parceiro</th>
            <th className="px-1.5 py-0.5 text-right font-bold">Consult.</th>
            <th className="px-1.5 py-0.5 text-left font-bold">Distribuição</th>
            {[1, 2, 3, 4, 5].map((band) => (
              <th key={band} className="px-1.5 py-0.5 text-right font-bold">
                Q{band}
              </th>
            ))}
            <th className="whitespace-nowrap px-1.5 py-0.5 text-right font-bold">Sem Q</th>
          </tr>
        </thead>
        <tbody>
          {quartilOverviewRows(rows).map((row) => (
            <tr key={row.partner} className="border-t border-slate-100">
              <th
                className="break-words whitespace-normal px-1.5 py-0.5 text-left font-medium text-slate-700"
                title={row.partner}
              >
                {row.partner}
              </th>
              <td className="px-1.5 py-0.5 text-right tabular-nums">{fmtInt(row.consultants)}</td>
              <td className="px-1.5 py-0.5">
                <QuartilDistributionBar
                  bands={row.quartiles}
                  total={row.consultants}
                  missing={row.missing}
                  className="!h-2"
                />
              </td>
              {row.quartiles.map((value, index) => (
                <td key={index} className="px-1.5 py-0.5 text-right tabular-nums">
                  {fmtInt(value)}
                </td>
              ))}
              <td className="px-1.5 py-0.5 text-right tabular-nums text-slate-500">
                {fmtInt(row.missing)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Visão consolidada num único slide: distribuição Q1–Q5 e cards de evolução (3 e 6
 * meses) de Receita, Móvel e FTTH.
 */
function QuartilOverviewReportPage(props: {
  quartil: QuartilSnapshot | null;
  partner: string;
  date: string;
}) {
  return (
    <>
      <QuartilOverviewReportPageContent
        {...props}
        reportMetrics={QUARTIL_REPORT_METRICS.slice(0, 3)}
      />
      {props.quartil && (
        <QuartilOverviewReportPageContent
          {...props}
          reportMetrics={QUARTIL_REPORT_METRICS.slice(3)}
        />
      )}
    </>
  );
}
function QuartilOverviewReportPageContent({
  quartil,
  partner,
  date,
  reportMetrics,
}: {
  quartil: QuartilSnapshot | null;
  partner: string;
  date: string;
  reportMetrics: typeof QUARTIL_REPORT_METRICS;
}) {
  const consultants = quartil?.consultants ?? [];

  return (
    <ReportPage
      title="Quartil de consultores · Distribuição e evolução"
      eyebrow="Performance comercial"
      partner={partner}
      date={date}
    >
      {!quartil ? (
        <div className="grid min-h-[520px] place-items-center rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Dados de Quartil indisponíveis para este recorte.
        </div>
      ) : (
        <>
          <div className="quartil-overview-grid grid grid-cols-1 gap-3">
            {reportMetrics.map((metric) => {
              const rows = quartilDistribution(quartil, metric.id);
              const total = sumQuartilRows(rows, "Total");
              return (
                <section
                  key={metric.id}
                  className="quartil-overview-card grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0">
                    <h2 className="mb-2 text-xs font-semibold text-slate-950">
                      Distribuição por parceiro · {metric.label}
                    </h2>
                    <QuartilDistributionBar
                      bands={total.quartiles}
                      total={total.consultants}
                      missing={total.missing}
                      className="!h-3"
                    />
                    <QuartilDistributionLegend
                      bands={total.quartiles}
                      missing={total.missing}
                      total={total.consultants}
                      stacked
                    />
                    <div className="mt-2">
                      <QuartilOverviewTable rows={rows} />
                    </div>
                  </div>
                  {(["3", "6"] as const).map((period) => (
                    <QuartilEvolutionCard
                      key={period}
                      consultants={consultants}
                      metric={metric}
                      period={period}
                      latestMonth={quartil.latestMonth}
                    />
                  ))}
                </section>
              );
            })}
          </div>
          <p className="mt-2 text-[8px] leading-3 text-slate-500">
            {fmtInt(consultants.length)} consultores em {fmtInt(quartil.partners.length)}{" "}
            parceiro(s) · competência mais recente: {quartil.latestMonth || "—"}.
            Evoluiu/Regrediu/Neutro comparam o atual com 3 e 6 registros anteriores disponíveis;
            consultores sem histórico ficam fora. Sem Q = sem classificação no mês.
          </p>
        </>
      )}
    </ReportPage>
  );
}
