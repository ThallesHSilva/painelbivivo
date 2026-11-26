import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trophy,
  X,
} from "lucide-react";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  exportProductionCsv,
  groupProduction,
  integer,
  isFtth,
  isMobileActivation,
  isMigration,
  isRenewal,
  money,
  normalizeProduction,
  orderCount,
  productionCategory,
  quantity,
  revenue,
  sumProduction,
  type ProductionData,
  type ProductionRow,
} from "@/lib/production";

export const Route = createFileRoute("/producao")({
  head: () => ({ meta: [{ title: "Produção — Painel A7" }] }),
  component: ProductionPage,
});
const CATEGORIES = [
  "Móvel",
  "Fixa Básica",
  "Avançada",
  "Office",
  "TI",
  "Vivo Tech",
  "VVN",
  "M2M",
  "Outros",
];
const currentMonth = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
};
type Filters = { team: string[]; consultant: string[]; status: string[] };
const INITIAL_FILTERS: Filters = { team: [], consultant: [], status: [] };
const EMPTY_ROWS: ProductionRow[] = [];

function FilterList({
  title,
  values,
  selected,
  onChange,
}: {
  title: string;
  values: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = values.filter((value) =>
    normalizeProduction(value).includes(normalizeProduction(search)),
  );
  return (
    <section className="production-filter">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {title}{" "}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {selected.length ? `${selected.length} selecionados` : "Todos"}
          </span>
        </h3>
        {selected.length > 0 && (
          <button
            aria-label={`Limpar ${title}`}
            className="rounded p-1 text-muted-foreground hover:text-primary"
            onClick={() => onChange([])}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {values.length > 6 && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            aria-label={`Buscar ${title.toLowerCase()}`}
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-xs"
          />
        </div>
      )}
      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {filtered.map((value) => (
          <label
            key={value}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted lg:min-h-9",
              selected.includes(value) && "bg-selection text-primary",
            )}
          >
            <input
              type="checkbox"
              className="size-3.5 shrink-0 accent-primary"
              checked={selected.includes(value)}
              onChange={() =>
                onChange(
                  selected.includes(value)
                    ? selected.filter((v) => v !== value)
                    : [...selected, value],
                )
              }
            />
            <span className="min-w-0 break-words">{value}</span>
          </label>
        ))}
        {!filtered.length && (
          <p className="py-3 text-xs text-muted-foreground">Nenhuma opção encontrada.</p>
        )}
      </div>
    </section>
  );
}

function MetricPanel({
  title,
  subtitle,
  items,
  format = money,
  total,
}: {
  title: string;
  subtitle?: string;
  items: [string, number][];
  format?: (value: number) => string;
  total?: [string, number];
}) {
  const max = Math.max(1, ...items.map((item) => Math.abs(item[1])));
  return (
    <section className="production-panel">
      <div className="mb-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <dl className="space-y-4">
        {items.map(([label, value]) => (
          <div key={label}>
            <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="shrink-0 font-medium tabular-nums">{format(value)}</dd>
            </div>
            <div className="h-1 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${(Math.abs(value) / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </dl>
      {total && (
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 text-sm font-semibold">
          <span>{total[0]}</span>
          <span className="tabular-nums">{format(total[1])}</span>
        </div>
      )}
    </section>
  );
}

function ProductionPage() {
  const [month, setMonth] = useState(currentMonth);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const data = useQuery<ProductionData>({
    queryKey: ["production", month],
    queryFn: async () => {
      const response = await fetch(`/api/producao?month=${month}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Não foi possível consultar a produção.");
      return body;
    },
    staleTime: 60_000,
    retry: 1,
  });
  const rows = data.data?.rows ?? EMPTY_ROWS;
  const options = useMemo(() => {
    const values = (key: string) =>
      [...new Set(rows.map((row) => row[key] || "Não informado"))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      );
    return {
      team: values("EQUIPE"),
      consultant: values("PROPRIETÁRIO DO PEDIDO"),
      status: values("FILA"),
    };
  }, [rows]);
  const selectedRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!filters.team.length || filters.team.includes(row.EQUIPE || "Não informado")) &&
          (!filters.consultant.length ||
            filters.consultant.includes(row["PROPRIETÁRIO DO PEDIDO"] || "Não informado")) &&
          (!filters.status.length || filters.status.includes(row.FILA || "Não informado")),
      ),
    [rows, filters],
  );
  const summary = useMemo(() => {
    const devices = selectedRows.filter((row) => productionCategory(row) === "Aparelhos");
    const renewals = selectedRows.filter(isRenewal);
    const sales = selectedRows.filter(
      (row) => !isRenewal(row) && productionCategory(row) !== "Aparelhos",
    );
    const b2c = selectedRows.filter((row) => row["PF OU PJ"].toUpperCase() === "PF");
    const byCategory = (records: ProductionRow[], category: string) =>
      sumProduction(records.filter((row) => productionCategory(row) === category));
    const top = (records: ProductionRow[], measure = revenue) =>
      groupProduction(records, (row) => row["PROPRIETÁRIO DO PEDIDO"], measure)[0];
    return {
      devices,
      renewals,
      sales,
      b2c,
      byCategory,
      tops: [
        { label: "Aparelhos", result: top(devices), format: money },
        {
          label: "Fixa Básica",
          result: top(selectedRows.filter(isFtth), quantity),
          format: integer,
        },
        {
          label: "Altas móvel",
          result: top(selectedRows.filter(isMobileActivation), quantity),
          format: integer,
        },
        {
          label: "Migração",
          result: top(selectedRows.filter(isMigration), quantity),
          format: integer,
        },
        { label: "Receita · novas vendas", result: top(sales), format: money },
      ],
    };
  }, [selectedRows]);
  const details = useMemo(
    () =>
      selectedRows.filter(
        (row) =>
          !search ||
          normalizeProduction(
            [
              row["NUMERO ATIVIDADE"],
              row["NOME CLIENTE"],
              row["CPF/CNPJ"],
              row["PROPRIETÁRIO DO PEDIDO"],
              row.PRODUTO,
            ].join(" "),
          ).includes(normalizeProduction(search)),
      ),
    [selectedRows, search],
  );
  const setFilter = (key: keyof Filters, value: string[]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };
  const reset = () => {
    setFilters({ team: [], consultant: [], status: [] });
    setSearch("");
    setPage(0);
  };
  const download = () => {
    if (!data.data) return;
    const url = URL.createObjectURL(
      new Blob([exportProductionCsv(details, data.data.columns)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `producao-${month}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const period = new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const pageCount = Math.max(1, Math.ceil(details.length / 25));
  const safePage = Math.min(page, pageCount - 1);
  return (
    <DashboardLayout title="Produção">
      <div className="production-page">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-medium text-primary">OPERAÇÃO COMERCIAL</p>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Produção</h1>
            <p className="mt-2 text-sm capitalize text-muted-foreground">
              {period} <span className="px-1.5">·</span> Por data de ativação
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="month"
              aria-label="Mês de ativação"
              value={month}
              min="2000-01"
              max="2099-12"
              className="w-44"
              onChange={(e) => {
                if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)) {
                  setMonth(e.target.value);
                  setPage(0);
                }
              }}
            />
            <Button
              variant="outline"
              aria-label="Atualizar produção"
              disabled={data.isFetching}
              onClick={() => void data.refetch()}
            >
              <RefreshCw className={cn("size-4", data.isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button onClick={download} disabled={!data.data || data.isFetching}>
              <ArrowDownToLine className="size-4" />
              Exportar CSV
            </Button>
          </div>
        </header>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                data.isError ? "bg-destructive" : data.isFetching ? "bg-warning" : "bg-success",
              )}
            />
            {data.data
              ? `Consultado em ${new Date(data.data.fetchedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
              : data.isError
                ? "Falha na consulta"
                : "Consultando a produção…"}
          </p>
          <p>{data.data ? `${integer(rows.length)} registros na base` : ""}</p>
        </div>
        {data.isError && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-5"
          >
            <h2 className="font-semibold">Não foi possível atualizar a produção</h2>
            <p className="mt-1 text-sm text-muted-foreground">{data.error.message}</p>
            {data.data && (
              <p className="mt-2 text-sm">Os dados abaixo são da última consulta concluída.</p>
            )}
            <Button className="mt-3" variant="outline" onClick={() => void data.refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}
        {data.isPending ? (
          <div aria-label="Carregando produção" className="grid gap-4 lg:grid-cols-[250px_1fr]">
            <Skeleton className="h-[650px]" />
            <div className="space-y-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-[500px]" />
            </div>
          </div>
        ) : (
          data.data && (
            <>
              <div className="production-layout">
                <aside className="min-w-0">
                  <div className="mb-3 flex items-center justify-between">
                    <button
                      onClick={() => setFiltersOpen(!filtersOpen)}
                      aria-expanded={filtersOpen}
                      className="flex min-h-10 items-center gap-2 text-sm font-semibold lg:pointer-events-none"
                    >
                      <SlidersHorizontal className="size-4 text-primary" />
                      Filtros{" "}
                      <span className="text-xs font-normal text-muted-foreground lg:hidden">
                        {filtersOpen ? "Recolher" : "Expandir"}
                      </span>
                    </button>
                    <button
                      onClick={reset}
                      className="min-h-10 text-xs font-medium text-primary hover:underline"
                    >
                      Limpar filtros
                    </button>
                  </div>
                  <div className={cn("space-y-3", !filtersOpen && "hidden lg:block")}>
                    <FilterList
                      title="Equipe"
                      values={options.team}
                      selected={filters.team}
                      onChange={(v) => setFilter("team", v)}
                    />
                    <FilterList
                      title="Consultor"
                      values={options.consultant}
                      selected={filters.consultant}
                      onChange={(v) => setFilter("consultant", v)}
                    />
                    <FilterList
                      title="Status"
                      values={options.status}
                      selected={filters.status}
                      onChange={(v) => setFilter("status", v)}
                    />
                    <p className="px-1 text-xs leading-5 text-muted-foreground">
                      O período considera a data de ativação. Sem filtro por última atualização.
                    </p>
                  </div>
                </aside>
                <div className="min-w-0 space-y-4">
                  <section className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
                      <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <Trophy className="size-4 text-primary" />
                        Destaques do período
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        Líderes no recorte selecionado
                      </span>
                    </div>
                    <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-5">
                      {summary.tops.map((top) => (
                        <div
                          key={top.label}
                          className="min-w-0 px-5 py-4 sm:border-r sm:border-border last:border-r-0"
                        >
                          <p className="text-xs text-muted-foreground">{top.label}</p>
                          <p className="mt-2 break-words text-lg font-semibold tabular-nums text-primary">
                            {top.result ? top.format(top.result[1]) : "—"}
                          </p>
                          <p className="mt-2 text-xs leading-5">
                            {top.result?.[0] ?? "Sem produção"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section
                    aria-label="Resumo da produção"
                    className="grid grid-cols-2 gap-y-5 rounded-xl border border-border bg-card px-5 py-5 xl:grid-cols-4"
                  >
                    {[
                      ["Valor total dos produtos", money(sumProduction(selectedRows))],
                      ["Pedidos únicos", integer(orderCount(selectedRows))],
                      ["Quantidade de produtos", integer(sumProduction(selectedRows, quantity))],
                      [
                        "Ticket médio por pedido",
                        orderCount(selectedRows)
                          ? money(sumProduction(selectedRows) / orderCount(selectedRows))
                          : "—",
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0 pr-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-2 break-words text-xl font-semibold tabular-nums 2xl:text-2xl">
                          {value}
                        </p>
                      </div>
                    ))}
                  </section>
                  {!selectedRows.length ? (
                    <section className="production-panel py-14 text-center">
                      <Filter className="mx-auto mb-3 size-6 text-muted-foreground" />
                      <h2 className="font-semibold">Nenhuma produção neste recorte</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Ajuste os filtros ou selecione outro mês.
                      </p>
                      <Button className="mt-4" variant="outline" onClick={reset}>
                        Limpar filtros
                      </Button>
                    </section>
                  ) : (
                    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <MetricPanel
                        title="Receitas"
                        subtitle="Novas vendas · sem aparelhos e renovações"
                        items={CATEGORIES.map((category) => [
                          category,
                          summary.byCategory(summary.sales, category),
                        ])}
                        total={["Total novas vendas", sumProduction(summary.sales)]}
                      />
                      <div className="space-y-4">
                        <MetricPanel
                          title="Quantidade"
                          subtitle="Unidades de produtos no recorte"
                          format={integer}
                          items={[
                            [
                              "Office",
                              sumProduction(
                                selectedRows.filter((r) => productionCategory(r) === "Office"),
                                quantity,
                              ),
                            ],
                            [
                              "TI",
                              sumProduction(
                                selectedRows.filter((r) => productionCategory(r) === "TI"),
                                quantity,
                              ),
                            ],
                            [
                              "Vivo Tech",
                              sumProduction(
                                selectedRows.filter((r) => productionCategory(r) === "Vivo Tech"),
                                quantity,
                              ),
                            ],
                            [
                              "VVN",
                              sumProduction(
                                selectedRows.filter((r) => productionCategory(r) === "VVN"),
                                quantity,
                              ),
                            ],
                            ["Fixa Básica", sumProduction(selectedRows.filter(isFtth), quantity)],
                            [
                              "Altas móvel",
                              sumProduction(selectedRows.filter(isMobileActivation), quantity),
                            ],
                            ["Migração", sumProduction(selectedRows.filter(isMigration), quantity)],
                          ]}
                        />
                        <MetricPanel
                          title="Outros resultados"
                          items={[["Aparelhos", sumProduction(summary.devices)]]}
                        />
                        <div className="production-panel flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Pedidos com aparelhos</span>
                          <strong className="tabular-nums">
                            {integer(orderCount(summary.devices))}
                          </strong>
                        </div>
                      </div>
                      <div className="space-y-4 md:col-span-2 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 xl:col-span-1 xl:block xl:space-y-4">
                        <MetricPanel
                          title="Renovações"
                          subtitle="Renovações e migrações da base"
                          items={["Avançada", "Fixa", "Migração"].map((category) => [
                            category,
                            summary.byCategory(summary.renewals, category),
                          ])}
                          total={["Total renovações", sumProduction(summary.renewals)]}
                        />
                        <MetricPanel
                          title="B2C"
                          subtitle="Pessoa física · incluído nos totais gerais"
                          items={[
                            ["Fixa Básica", summary.byCategory(summary.b2c, "Fixa Básica")],
                            ["Móvel", summary.byCategory(summary.b2c, "Móvel")],
                            [
                              "Demais produtos",
                              sumProduction(
                                summary.b2c.filter(
                                  (r) => !["Fixa Básica", "Móvel"].includes(productionCategory(r)),
                                ),
                              ),
                            ],
                          ]}
                          total={["Valor total B2C", sumProduction(summary.b2c)]}
                        />
                      </div>
                    </div>
                  )}
                  <details className="rounded-lg border border-border px-4 py-3 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-medium text-foreground">
                      Critérios dos indicadores
                    </summary>
                    <p className="mt-3 leading-6">
                      Receita = valor unitário × quantidade. Pedidos são contados por NUMERO
                      ATIVIDADE, sem duplicar as linhas de produtos. Renovações agrupam os grupos
                      que contêm “Renovação”, mais a migração exata. Móvel considera somente GRUPO =
                      “Móvel Altas Totais”; Migração considera somente “Móvel - Migração”; Fixa
                      Básica considera somente “Fixa Básica Ativação Total - Voz | Dados | SVA”. Os
                      demais grupos móveis e de ativação fixa ficam em Outros. B2C considera PF OU
                      PJ = PF e já faz parte dos demais totais. Classificações comerciais devem ser
                      validadas antes do uso gerencial. Campos de carteira M15/M16/M17 e unidade não
                      estão disponíveis nesta base.
                    </p>
                  </details>
                </div>
              </div>
              <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div>
                    <h2 className="font-semibold">Detalhamento da produção</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {integer(details.length)} registros · {integer(orderCount(details))} pedidos ·{" "}
                      {money(sumProduction(details))}
                    </p>
                  </div>
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                    <Input
                      aria-label="Buscar registros de produção"
                      placeholder="Pedido, cliente, CPF/CNPJ ou produto"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                      }}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="production-table">
                    <thead>
                      <tr>
                        {[
                          "Pedido / cliente",
                          "Consultor / equipe",
                          "Grupo / produto",
                          "Status",
                          "Ativação",
                          "Qtd.",
                          "Valor unit.",
                          "Receita",
                        ].map((label, i) => (
                          <th key={label} className={i > 4 ? "text-right" : "text-left"}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {details.slice(safePage * 25, safePage * 25 + 25).map((row, i) => (
                        <tr key={`${row["NUMERO ATIVIDADE"]}-${i}`}>
                          <td>
                            <strong className="font-medium">
                              {row["NUMERO ATIVIDADE"] || "—"}
                            </strong>
                            <span className="production-cell-secondary">{row["NOME CLIENTE"]}</span>
                          </td>
                          <td>
                            {row["PROPRIETÁRIO DO PEDIDO"] || "—"}
                            <span className="production-cell-secondary">{row.EQUIPE}</span>
                          </td>
                          <td>
                            {row.GRUPO}
                            <span className="production-cell-secondary">{row.PRODUTO}</span>
                          </td>
                          <td>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 text-xs",
                                row.FILA === "Executados" && "text-success",
                              )}
                            >
                              {row.FILA === "Executados" && <Check className="size-3.5" />}
                              {row.FILA || "—"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap">
                            {row["DATA INSTALAÇÃO"]
                              ? new Date(
                                  row["DATA INSTALAÇÃO"].slice(0, 10) + "T12:00:00",
                                ).toLocaleDateString("pt-BR")
                              : "—"}
                          </td>
                          <td className="text-right tabular-nums">{integer(quantity(row))}</td>
                          <td className="whitespace-nowrap text-right tabular-nums">
                            {money(Number(row["VALOR UNIT"]))}
                          </td>
                          <td className="whitespace-nowrap text-right font-medium tabular-nums">
                            {money(revenue(row))}
                          </td>
                        </tr>
                      ))}
                      {!details.length && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-muted-foreground">
                            Nenhum registro encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    Página {safePage + 1} de {pageCount} · Exportação inclui todos os registros do
                    recorte
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Página anterior"
                      disabled={safePage === 0}
                      onClick={() => setPage(safePage - 1)}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Próxima página"
                      disabled={safePage >= pageCount - 1}
                      onClick={() => setPage(safePage + 1)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </section>
            </>
          )
        )}
      </div>
    </DashboardLayout>
  );
}
