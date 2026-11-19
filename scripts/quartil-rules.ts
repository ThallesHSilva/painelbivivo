// Shared by imports, API, screen and reports. No server-only dependencies.
export const QUARTIL_METRICS = [
  "receita",
  "movel",
  "ftth",
  "renovacoes",
  "receita_renovacoes",
] as const;
export type QuartilMetric = (typeof QUARTIL_METRICS)[number];
export type QuartilTenure = "experienced" | "new";
export type QuartilValues = Record<QuartilMetric, number | null>;
export type QuartilRange = {
  label: string;
  min?: number;
  max?: number;
  minExclusive?: boolean;
  maxExclusive?: boolean;
};
export type QuartilRules = Record<
  QuartilTenure,
  { label: string; metrics: Record<QuartilMetric, QuartilRange[]> }
>;
export type QuartilSource = { report: string; importedAt: string };
export type QuartilPoint = {
  id: string;
  name: string;
  partnerId: string;
  partnerName: string;
  month: string;
  tenure: QuartilTenure | null;
  values: QuartilValues;
  quartiles: QuartilValues;
};
export type QuartilConsultant = QuartilPoint & {
  history: QuartilPoint[];
  comparisons: Record<"3" | "6", { month: string; changes: QuartilValues }>;
};
export type QuartilSnapshot = {
  source: QuartilSource;
  latestMonth: string;
  months: string[];
  partners: { id: string; name: string }[];
  consultants: QuartilConsultant[];
  warnings: string[];
  rules?: QuartilRules;
  rulesSource?: QuartilSource;
  originalFile?: string;
  rulesFile?: string;
  originalAvailable?: boolean;
  rulesFileAvailable?: boolean;
};
export const QUARTIL_LABELS: Record<QuartilMetric, string> = {
  receita: "Receita",
  movel: "Móvel",
  ftth: "FTTH",
  renovacoes: "Renovações",
  receita_renovacoes: "Receita de renovações",
};
export const QUARTIL_MONEY_METRICS: readonly QuartilMetric[] = ["receita", "receita_renovacoes"];
const above = (label: string, min: number): QuartilRange => ({ label, min, minExclusive: true });
const between = (label: string, min: number, max: number, minExclusive = false): QuartilRange => ({
  label,
  min,
  max,
  minExclusive,
});
const zero = { label: "0", min: 0, max: 0 };
const baseRules = {
  experienced: {
    label: "Acima de 3 meses",
    metrics: {
      receita: [
        above("Acima de R$ 2.250", 2250),
        between("Acima de R$ 1.400 até R$ 2.250", 1400, 2250, true),
        between("Acima de R$ 800 até R$ 1.400", 800, 1400, true),
        between("R$ 500 a R$ 800", 500, 800),
        { label: "Abaixo de R$ 500", min: 0, max: 500, maxExclusive: true },
      ],
      movel: [
        above("Acima de 25", 25),
        between("16 a 25", 15, 25, true),
        between("11 a 15", 10, 15, true),
        between("6 a 10", 5, 10, true),
        between("0 a 5", 0, 5),
      ],
      ftth: [
        above("Acima de 10", 10),
        between("6 a 10", 5, 10, true),
        between("3 a 5", 2, 5, true),
        between("1 a 2", 0, 2, true),
        zero,
      ],
    },
  },
  new: {
    label: "Até 3 meses",
    metrics: {
      receita: [
        { label: "R$ 500 ou mais", min: 500 },
        {
          label: "Acima de R$ 250 e abaixo de R$ 500",
          min: 250,
          minExclusive: true,
          max: 500,
          maxExclusive: true,
        },
        between("Acima de R$ 100 até R$ 250", 100, 250, true),
        between("Acima de R$ 0 até R$ 100", 0, 100, true),
        zero,
      ],
      movel: [
        above("Acima de 15", 15),
        between("11 a 15", 10, 15, true),
        between("6 a 10", 5, 10, true),
        between("1 a 5", 0, 5, true),
        zero,
      ],
      ftth: [
        above("Acima de 10", 10),
        between("6 a 10", 5, 10, true),
        between("3 a 5", 2, 5, true),
        between("1 a 2", 0, 2, true),
        zero,
      ],
    },
  },
};
export const QUARTIL_RULES = Object.fromEntries(
  Object.entries(baseRules).map(([tenure, group]) => [
    tenure,
    {
      label: group.label,
      metrics: {
        ...group.metrics,
        renovacoes: group.metrics.movel.map((range) => ({ ...range })),
        receita_renovacoes: group.metrics.receita.map((range) => ({ ...range })),
      },
    },
  ]),
) as QuartilRules;

export function quartileFor(
  tenure: QuartilTenure | null,
  metric: QuartilMetric,
  value: number | null | undefined,
  rules: QuartilRules = QUARTIL_RULES,
): number | null {
  if (!tenure || value == null || !Number.isFinite(value) || value < 0) return null;
  const index = rules[tenure].metrics[metric].findIndex(
    (range) =>
      (range.min === undefined || (range.minExclusive ? value > range.min : value >= range.min)) &&
      (range.max === undefined || (range.maxExclusive ? value < range.max : value <= range.max)),
  );
  return index < 0 ? null : index + 1;
}
export function quartilesFor(
  point: Pick<QuartilPoint, "values" | "tenure">,
  rules = QUARTIL_RULES,
): QuartilValues {
  return Object.fromEntries(
    QUARTIL_METRICS.map((metric) => [
      metric,
      quartileFor(point.tenure, metric, point.values[metric], rules),
    ]),
  ) as QuartilValues;
}
export function quartilComparisons(
  consultant: Pick<QuartilConsultant, "history">,
): QuartilConsultant["comparisons"] {
  const history = [...consultant.history].sort((a, b) => a.month.localeCompare(b.month));
  const latest = history.at(-1);
  return Object.fromEntries(
    [3, 6].map((period) => {
      const prior = history.at(-1 - period);
      return [
        String(period),
        {
          month: prior?.month ?? "",
          changes: Object.fromEntries(
            QUARTIL_METRICS.map((metric) => {
              const current = latest?.quartiles[metric],
                previous = prior?.quartiles[metric];
              return [metric, current == null || previous == null ? null : previous - current];
            }),
          ),
        },
      ];
    }),
  ) as QuartilConsultant["comparisons"];
}
export function consultantScore(consultant: Pick<QuartilConsultant, "quartiles">) {
  return QUARTIL_METRICS.reduce(
    (sum, metric) =>
      sum + (consultant.quartiles[metric] == null ? 0 : 6 - consultant.quartiles[metric]!),
    0,
  );
}
export function quartilAlert(consultant: QuartilConsultant) {
  const history = [...consultant.history].sort((a, b) => a.month.localeCompare(b.month));
  let months = 0;
  for (const point of history) {
    if (QUARTIL_METRICS.some((metric) => point.quartiles[metric] === 5)) months += 1;
    else months = 0;
  }
  const metrics = QUARTIL_METRICS.filter((metric) => consultant.quartiles[metric] === 5);
  return { active: months > 3 && metrics.length > 0, months, metrics };
}
export function isQuartilAlert(consultant: QuartilConsultant, _metric?: QuartilMetric) {
  return quartilAlert(consultant).active;
}
export function quartilEvolutionCounts(
  consultants: QuartilConsultant[],
  metric: QuartilMetric,
  period: "3" | "6",
) {
  let up = 0,
    down = 0,
    stable = 0;
  for (const consultant of consultants) {
    const change = consultant.comparisons[period].changes[metric];
    if (change == null) continue;
    if (change > 0) up += 1;
    else if (change < 0) down += 1;
    else stable += 1;
  }
  return { up, down, stable, alert: consultants.filter((c) => isQuartilAlert(c)).length };
}
export function quartilRangeLabel(
  metric: QuartilMetric,
  tenure: QuartilTenure,
  quartile: number,
  rules = QUARTIL_RULES,
) {
  return rules[tenure].metrics[metric][quartile - 1]?.label ?? "Sem faixa";
}
export function normalizeQuartilSnapshot(snapshot: QuartilSnapshot): QuartilSnapshot {
  const rules = snapshot.rules ?? QUARTIL_RULES;
  const consultants = snapshot.consultants.map((consultant) => {
    const history = (consultant.history.length ? consultant.history : [consultant])
      .map((point) => {
        const values = Object.fromEntries(
          QUARTIL_METRICS.map((metric) => [metric, point.values[metric] ?? null]),
        ) as QuartilValues;
        return { ...point, values, quartiles: quartilesFor({ ...point, values }, rules) };
      })
      .sort((a, b) => a.month.localeCompare(b.month));
    return {
      ...consultant,
      ...history.at(-1)!,
      history,
      comparisons: quartilComparisons({ history }),
    };
  });
  return { ...snapshot, rules, consultants };
}
export type QuartilImport =
  | { kind: "rules"; rules: QuartilRules; source: QuartilSource }
  | { kind: "snapshot"; snapshot: QuartilSnapshot };
export function applyQuartilImport(
  previous: QuartilSnapshot,
  imported: QuartilImport,
): QuartilSnapshot {
  if (imported.kind === "rules")
    return normalizeQuartilSnapshot({
      ...previous,
      rules: imported.rules,
      rulesSource: imported.source,
    });
  return normalizeQuartilSnapshot({
    ...imported.snapshot,
    rules: previous.rules ?? imported.snapshot.rules,
    rulesSource: previous.rulesSource,
    rulesFile: previous.rulesFile,
  });
}
