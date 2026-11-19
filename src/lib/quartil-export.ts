import { downloadWorkbook } from "./xlsx-workbook";
import {
  QUARTIL_METRICS,
  QUARTIL_LABELS,
  QUARTIL_RULES,
  consultantScore,
  quartilAlert,
  type QuartilConsultant,
  type QuartilSnapshot,
} from "./quartil";

export function exportQuartil(snapshot: QuartilSnapshot, consultants: QuartilConsultant[]) {
  const text = (value: number | null | undefined) => (value == null ? "" : String(value));
  const rules = snapshot.rules ?? QUARTIL_RULES;
  downloadWorkbook(
    [
      {
        name: "Ranking",
        rows: [
          [
            "Consultor",
            "Parceiro",
            "Competência",
            "Tempo de casa",
            "Score (0–25)",
            ...QUARTIL_METRICS.flatMap((metric) => [
              QUARTIL_LABELS[metric],
              `Quartil ${QUARTIL_LABELS[metric]}`,
            ]),
            "Alerta Q5",
            "Registros seguidos em Q5",
          ],
          ...consultants.map((c) => [
            c.name,
            c.partnerName,
            c.month,
            c.tenure ? rules[c.tenure].label : "Não informado",
            String(consultantScore(c)),
            ...QUARTIL_METRICS.flatMap((metric) => [
              text(c.values[metric]),
              text(c.quartiles[metric]),
            ]),
            quartilAlert(c).active ? "Sim" : "Não",
            String(quartilAlert(c).months),
          ]),
        ],
      },
      {
        name: "Histórico",
        rows: [
          [
            "Consultor",
            "Parceiro",
            "Competência",
            ...QUARTIL_METRICS.flatMap((metric) => [
              QUARTIL_LABELS[metric],
              `Quartil ${QUARTIL_LABELS[metric]}`,
            ]),
          ],
          ...consultants.flatMap((c) =>
            c.history.map((point) => [
              c.name,
              point.partnerName,
              point.month,
              ...QUARTIL_METRICS.flatMap((metric) => [
                text(point.values[metric]),
                text(point.quartiles[metric]),
              ]),
            ]),
          ),
        ],
      },
      {
        name: "Faixas",
        rows: [
          ["Tempo de casa", "Indicador", "Q1", "Q2", "Q3", "Q4", "Q5"],
          ...(["experienced", "new"] as const).flatMap((tenure) =>
            QUARTIL_METRICS.map((metric) => [
              rules[tenure].label,
              QUARTIL_LABELS[metric],
              ...rules[tenure].metrics[metric].map((range) => range.label),
            ]),
          ),
        ],
      },
      {
        name: "Metodologia",
        rows: [
          ["Item", "Definição"],
          ["Base", snapshot.source.report],
          ["Faixas", snapshot.rulesSource?.report ?? "Regras padrão"],
          ["Score", "Soma dos cinco quartis. Q1 = 5 pontos; Q5 = 1; sem dado = 0. Máximo 25."],
          ["Evolução", "Compara o atual com 3 ou 6 registros anteriores disponíveis do consultor."],
          [
            "Alerta",
            "Mais de três registros seguidos com algum indicador em Q5. Não depende da métrica selecionada.",
          ],
          [
            "Dados ausentes",
            "Células vazias indicam ausência de apuração; zero é preservado como valor.",
          ],
        ],
      },
    ],
    `quartil-${snapshot.latestMonth || "base"}.xlsx`,
  );
}
