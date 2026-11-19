import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildQuartilSnapshot, parseMonth } from "./quartil.mjs";
import { parseQuartilSheets } from "./quartil-import.mjs";
import { readSpreadsheetSheets } from "./spreadsheet-reader.mjs";
import {
  QUARTIL_RULES,
  QUARTIL_METRICS,
  quartileFor,
  consultantScore,
  quartilAlert,
  applyQuartilImport,
  normalizeQuartilSnapshot,
} from "./quartil-rules.ts";
import { createWorkbook } from "../src/lib/xlsx-workbook.ts";
const headers = [
  "Consultor",
  "Parceiro",
  "M de CASA",
  "RECEITA TELECOM TT",
  "FISICOS MÓVEL",
  "FISICOS FTTH",
  "RENOVAÇÕES",
  "RECEITA RENOVAÇÕES",
];
const row = (name = "Ana", partner = "A7", revenue = 500, tenure = "ACIMA DE M3") => [
  name,
  partner,
  tenure,
  revenue,
  21,
  11,
  8,
  369.927,
];
const sheet = (name, rows) => ({ name, rows: [headers, ...rows] });
const empty = {
  source: { report: "", importedAt: "" },
  latestMonth: "",
  months: [],
  partners: [],
  consultants: [],
  warnings: [],
};
function ruleSheet(rules = QUARTIL_RULES) {
  return {
    name: "TABELA DE CONSULTORES",
    rows: [
      ["Tempo de casa", "Indicador", "Q1", "Q2", "Q3", "Q4", "Q5"],
      ...["experienced", "new"].flatMap((tenure) =>
        ["receita", "movel", "ftth"].map((metric) => [
          rules[tenure].label,
          metric,
          ...rules[tenure].metrics[metric].map((r) => r.label),
        ]),
      ),
    ],
  };
}
test("faixas A7 e limites exatos de receita, móvel e FTTH", () => {
  for (const [tenure, metric, amount, expected] of [
    ["experienced", "receita", 2250, 2],
    ["experienced", "receita", 2250.01, 1],
    ["experienced", "receita", 1400, 3],
    ["experienced", "receita", 800, 4],
    ["experienced", "receita", 499.99, 5],
    ["experienced", "movel", 25, 2],
    ["experienced", "movel", 26, 1],
    ["experienced", "ftth", 11, 1],
    ["new", "receita", 100, 4],
    ["new", "receita", 100.01, 3],
    ["new", "receita", 250.5, 2],
    ["new", "ftth", 1, 4],
    ["new", "ftth", 2, 4],
    ["new", "ftth", 6, 2],
    ["new", "ftth", 10, 2],
    ["new", "ftth", 11, 1],
  ])
    assert.equal(quartileFor(tenure, metric, amount), expected, tenure + metric + amount);
  assert.equal(quartileFor(null, "receita", 100), null);
  assert.equal(quartileFor("new", "receita", null), null);
  assert.equal(quartileFor("new", "receita", -1), null);
});
test("cinco indicadores preservam dinheiro decimal e score máximo 25", () => {
  const data = buildQuartilSnapshot([sheet("Set_26", [row()])], "base.xlsx");
  const c = data.consultants[0];
  assert.equal(c.values.receita_renovacoes, 369.927);
  assert.equal(c.values.renovacoes, 8);
  assert.equal(Object.keys(c.quartiles).length, 5);
  assert.equal(
    consultantScore({ ...c, quartiles: Object.fromEntries(QUARTIL_METRICS.map((m) => [m, 1])) }),
    25,
  );
});
test("colunas ausentes são null, zero permanece um resultado Q5", () => {
  const data = buildQuartilSnapshot(
    [{ name: "Set_26", rows: [headers.slice(0, 6), row().slice(0, 6)] }],
    "old.xlsx",
  );
  const c = data.consultants[0];
  assert.equal(c.values.renovacoes, null);
  assert.equal(c.quartiles.renovacoes, null);
  const zero = row();
  zero[6] = 0;
  assert.equal(
    buildQuartilSnapshot([sheet("Set_26", [zero])], "base.xlsx").consultants[0].quartiles
      .renovacoes,
    5,
  );
});
test("evolução usa 3 e 6 registros anteriores, inclusive com lacunas de calendário", () => {
  const months = ["Jan_26", "Fev_26", "Mar_26", "Abr_26", "Mai_26", "Jun_26", "Set_26"];
  const data = buildQuartilSnapshot(
    months.map((m, i) => sheet(m, [row("Ana", "A7", i === 6 ? 3000 : 500)])),
    "base.xlsx",
  );
  const c = data.consultants[0];
  assert.equal(c.comparisons[3].month, "2026-04");
  assert.equal(c.comparisons[6].month, "2026-01");
  assert.equal(c.comparisons[3].changes.receita, 3);
  assert.equal(
    buildQuartilSnapshot([sheet("Set_26", [row()])], "base.xlsx").consultants[0].comparisons[3]
      .changes.receita,
    null,
  );
});
test("alerta só após quatro registros com qualquer indicador em Q5", () => {
  const data = buildQuartilSnapshot(
    ["Jan_26", "Mar_26", "Mai_26", "Set_26"].map((m) => sheet(m, [row()])),
    "base.xlsx",
  );
  const c = data.consultants[0];
  c.history.forEach((p, i) => {
    p.quartiles = Object.fromEntries(QUARTIL_METRICS.map((m) => [m, 2]));
    p.quartiles[QUARTIL_METRICS[i]] = 5;
  });
  c.quartiles = c.history.at(-1).quartiles;
  assert.equal(quartilAlert(c).active, true);
  assert.equal(quartilAlert({ ...c, history: c.history.slice(1) }).active, false);
  c.history[2].quartiles = Object.fromEntries(QUARTIL_METRICS.map((m) => [m, 2]));
  assert.equal(quartilAlert(c).active, false);
});
test("parceiro atrasado continua visível e homônimos não são misturados", () => {
  const data = buildQuartilSnapshot(
    [sheet("Set_26", [row()]), sheet("Ago_26", [row(), row("Ana", "Outro")])],
    "base.xlsx",
  );
  assert.equal(data.consultants.length, 2);
  assert.equal(data.consultants.find((c) => c.partnerName === "Outro").month, "2026-08");
  assert.equal(data.consultants.find((c) => c.partnerName === "A7").history.length, 2);
});
test("duplicidade conflitante é rejeitada, linha zerada não sobrepõe resultado", () => {
  assert.throws(
    () => buildQuartilSnapshot([sheet("Set_26", [row(), row("Ana", "A7", 999)])], "base.xlsx"),
    /duplicado/,
  );
  const blank = row();
  for (let i = 3; i < blank.length; i++) blank[i] = 0;
  assert.equal(
    buildQuartilSnapshot([sheet("Set_26", [row(), blank])], "base.xlsx").consultants[0].values
      .receita,
    500,
  );
});
test("faixas por Excel são independentes da base e recalculam todo o histórico", () => {
  const custom = structuredClone(QUARTIL_RULES);
  custom.experienced.metrics.receita[0] = {
    label: "Acima de R$ 3.000",
    min: 3000,
    minExclusive: true,
  };
  custom.experienced.metrics.receita[1] = {
    label: "Acima de R$ 1.400 até R$ 3.000",
    min: 1400,
    minExclusive: true,
    max: 3000,
  };
  const imported = parseQuartilSheets([ruleSheet(custom)], "faixas.xlsx");
  assert.equal(imported.kind, "rules");
  const base = buildQuartilSnapshot([sheet("Set_26", [row("Ana", "A7", 2500)])], "base.xlsx");
  assert.equal(base.consultants[0].quartiles.receita, 1);
  const updated = applyQuartilImport(base, imported);
  assert.equal(updated.consultants[0].quartiles.receita, 2);
  assert.equal(updated.source.report, "base.xlsx");
  assert.equal(updated.rulesSource.report, "faixas.xlsx");
  const rulesFirst = applyQuartilImport(empty, imported);
  assert.equal(rulesFirst.consultants.length, 0);
  assert.equal(
    applyQuartilImport(rulesFirst, { kind: "snapshot", snapshot: base }).consultants[0].quartiles
      .receita,
    2,
  );
});
test("faixas incompletas ou sobrepostas são rejeitadas", () => {
  const overlap = ruleSheet();
  overlap.rows[1][3] = "R$ 1.401 a R$ 3.000";
  assert.throws(() => parseQuartilSheets([overlap], "bad.xlsx"), /sobrepostas/);
  const missing = ruleSheet();
  missing.rows.splice(4);
  assert.throws(() => parseQuartilSheets([missing], "bad.xlsx"), /Informe as faixas/);
});
test("normalização migra snapshots antigos sem inventar renovações", () => {
  const base = buildQuartilSnapshot([sheet("Set_26", [row()])], "base.xlsx");
  delete base.rules;
  for (const point of base.consultants[0].history) {
    delete point.values.renovacoes;
    delete point.values.receita_renovacoes;
    point.quartiles.receita = 1;
  }
  const migrated = normalizeQuartilSnapshot(base);
  assert.equal(migrated.consultants[0].values.renovacoes, null);
  assert.equal(migrated.consultants[0].quartiles.receita, 4);
});
test("XLSX real faz ida e volta de faixas, fórmulas e indicadores", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "a7-quartil-"));
  try {
    const file = path.join(directory, "base.xlsx");
    await writeFile(file, createWorkbook([{ name: "Set_26", rows: [headers, row().map(String)] }]));
    const parsed = parseQuartilSheets(await readSpreadsheetSheets(file), "base.xlsx");
    assert.equal(parsed.snapshot.consultants[0].values.receita_renovacoes, 369.927);
    const faixas = ruleSheet();
    await writeFile(file, createWorkbook([faixas]));
    const parsedRules = parseQuartilSheets(
      await readSpreadsheetSheets(file, { includeReference: true }),
      "faixas.xlsx",
    );
    assert.equal(parsedRules.kind, "rules");
    assert.equal(parsedRules.rules.new.metrics.ftth[3].min, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("abas mensais continuam reconhecidas", () => {
  assert.equal(parseMonth("Abr_26 "), "2026-04");
  assert.equal(parseMonth("TABELA DE CONSULTORES"), null);
});
