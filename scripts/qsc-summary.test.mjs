import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { zip, sheet } from "../src/lib/xlsx-workbook.ts";
import {
  aggregateRecords,
  buildQscSummarySnapshot,
  parseQscSummaryRows,
  QSC_OPERATION_ID,
} from "./process-qsc-summary.mjs";

const filters = (type) =>
  `Filtros aplicados:\nTIPO_QSC é ${type}\nGRUPO_REDE_TERMO é VITALE TELECOM\nanomestxt é 202609\nTIPO_QSC não é (Em branco)`;

test("lê o QSC simples pelos filtros aplicados e preserva os valores reportados", () => {
  const parsed = parseQscSummaryRows(
    [
      ["-", "Diretoria", "Resultado", "KPI 1", "KPI 2", "%", "Nota", "Faixa_resumo"],
      ["Movel", "CONSULTIVO", "Digitalização Score", 10, 104, 0.0961, 15, "1"],
      ["Movel", "CONSULTIVO", "Total", 10, 104, 0.0961, 15, "C"],
      [filters("Movel")],
    ],
    "Resumo_Móvel.xlsx",
  );

  assert.equal(parsed.domain, "movel");
  assert.equal(parsed.partnerName, "VITALE TELECOM");
  assert.equal(parsed.competence, "2026-09");
  assert.deepEqual(parsed.records[0], {
    id: "digitalizacao-movel",
    domain: "movel",
    result: "Digitalização Score",
    competence: "2026-09",
    partnerName: "VITALE TELECOM",
    kpi1: 10,
    kpi2: 104,
    percent: 0.0961,
    note: 15,
    band: "1",
  });
});

test("mapeia Banda Larga para o domínio interno fixa e mantém nota vazia", () => {
  const parsed = parseQscSummaryRows([
    ["-", "Diretoria", "Resultado", "KPI 1", "KPI 2", "%", "Nota", "Faixa_resumo"],
    ["Banda Larga", "CONSULTIVO", "% Cancelamento Comercial", 9, 47, 0.1914, "", ""],
    [filters("Banda Larga")],
  ]);

  assert.equal(parsed.domain, "fixa");
  assert.equal(parsed.records[0].id, "cancelamento-comercial");
  assert.equal(parsed.records[0].note, null);
  assert.equal(parsed.records[0].band, null);
});

test("recalcula a nota consolidada pela faixa em vez de somar notas dos parceiros", () => {
  const consolidated = aggregateRecords([
    {
      id: "digitalizacao-movel",
      domain: "movel",
      result: "% Digitalizacao das altas",
      competence: "2026-09",
      partnerName: "PARCEIRO A",
      kpi1: 4,
      kpi2: 50,
      percent: 0.08,
      note: 15,
      band: "1",
    },
    {
      id: "digitalizacao-movel",
      domain: "movel",
      result: "% Digitalizacao das altas",
      competence: "2026-09",
      partnerName: "PARCEIRO B",
      kpi1: 4,
      kpi2: 50,
      percent: 0.08,
      note: 15,
      band: "1",
    },
  ]);

  assert.deepEqual(
    [consolidated[0].kpi1, consolidated[0].kpi2, consolidated[0].percent],
    [8, 100, 0.08],
  );
  assert.deepEqual([consolidated[0].note, consolidated[0].band], [15, "1"]);
});

const summaryRows = (type, month = "202611", partner = null, note = 15) => [
  ["-", "Diretoria", "Resultado", "KPI 1", "KPI 2", "%", "Nota", "Faixa_resumo"],
  [
    type,
    "CONSULTIVO",
    type === "Movel" ? "Digitalização Score" : "% Re-Alta",
    29,
    238,
    0.1218,
    note ?? "",
    note === null ? "" : "1",
  ],
  [
    `Filtros aplicados:\r\nTIPO_QSC é ${type}\r\nNM_DIRETORIA é CONSULTIVO\r\nanomestxt é ${month}${partner ? `\r\nGRUPO_REDE_TERMO é ${partner}` : ""}\r\nTIPO_QSC não é (Em branco)`,
  ],
];

test("aceita os resumos da operação sem GRUPO_REDE_TERMO, preservando competência e valores", () => {
  for (const [type, domain] of [
    ["Movel", "movel"],
    ["Carteira", "carteira"],
    ["Banda Larga", "fixa"],
  ]) {
    const parsed = parseQscSummaryRows(summaryRows(type));
    assert.equal(parsed.scope, "operation");
    assert.equal(parsed.partnerName, "Operação");
    assert.equal(parsed.domain, domain);
    assert.equal(parsed.competence, "2026-11");
    assert.equal(parsed.records[0].percent, 0.1218);
    assert.equal(parsed.records[0].note, 15);
  }
});

test("continua exigindo tipo e competência válidos mesmo sem parceiro", () => {
  assert.throws(() => parseQscSummaryRows(summaryRows("Outro")), /TIPO_QSC não suportado/);
  assert.throws(() => parseQscSummaryRows(summaryRows("Movel", "202613")), /anomestxt inválido/);
  const missingMonth = summaryRows("Movel");
  missingMonth[2][0] = "Filtros aplicados:\nTIPO_QSC é Movel";
  assert.throws(() => parseQscSummaryRows(missingMonth), /TIPO_QSC e anomestxt/);
});

test("consolidação de uma fonte preserva nota ausente, nota zero e percentual reportado", () => {
  for (const note of [null, 0, 15]) {
    const parsed = parseQscSummaryRows(summaryRows("Movel", "202611", null, note));
    const [record] = aggregateRecords(parsed.records);
    assert.equal(record.note, note);
    assert.equal(record.percent, 0.1218);
    assert.equal(record.band, note === null ? null : "1");
  }
});

async function summaryFile(folder, name, rows) {
  const file = path.join(folder, name);
  await writeFile(file, zip([{ name: "xl/worksheets/sheet1.xml", data: sheet(rows) }]));
  return file;
}

test("operação substitui parceiros só no mesmo domínio/mês, preservando histórico e outros domínios", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "qsc-summary-"));
  const files = await Promise.all([
    summaryFile(folder, "operation.xlsx", summaryRows("Movel")),
    summaryFile(folder, "old-a.xlsx", summaryRows("Movel", "202611", "PARCEIRO A")),
    summaryFile(folder, "old-b.xlsx", summaryRows("Movel", "202611", "PARCEIRO B")),
    summaryFile(folder, "history.xlsx", summaryRows("Movel", "202610", "PARCEIRO A")),
    summaryFile(folder, "fixa.xlsx", summaryRows("Banda Larga", "202611", "PARCEIRO A", null)),
  ]);
  const snapshot = await buildQscSummarySnapshot(files);
  const all = snapshot.scopes.find((scope) => scope.id === "__all__");
  const latest = all.metrics.find(
    (metric) => metric.domain === "movel" && metric.latest.competence === "2026-11",
  );
  assert.equal(latest.latest.numerator, 29);
  assert.equal(latest.latest.denominator, 238);
  assert.equal(latest.latest.value, 0.1218);
  assert.equal(latest.latest.score, 15);
  assert.equal(snapshot.source.length, 3);
  assert.deepEqual(snapshot.competencies, ["2026-10", "2026-11"]);
  assert.equal(all.metrics.filter((metric) => metric.domain === "movel").length, 2);
  assert.equal(all.metrics.find((metric) => metric.domain === "fixa").latest.score, null);
  assert.equal(snapshot.scopes.find((scope) => scope.id === QSC_OPERATION_ID).metrics.length, 1);
  assert.equal(snapshot.scopes.find((scope) => scope.id === "parceiro-a").metrics.length, 2);
});

test("não soma duas bases da operação para o mesmo domínio e mês", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "qsc-duplicate-"));
  const files = await Promise.all([
    summaryFile(folder, "a.xlsx", summaryRows("Movel")),
    summaryFile(folder, "b.xlsx", summaryRows("Movel")),
  ]);
  await assert.rejects(buildQscSummarySnapshot(files), /Mais de uma base QSC/);
});
