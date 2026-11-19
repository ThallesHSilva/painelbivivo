import { normalizeHeader } from "./spreadsheet-reader.mjs";
import { buildQuartilSnapshot } from "./quartil.mjs";
import { QUARTIL_METRICS, QUARTIL_LABELS } from "./quartil-rules.ts";

const normalizedText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
function metricFor(value) {
  const text = normalizedText(value);
  if (/receita.*renovac/.test(text)) return "receita_renovacoes";
  if (/renovac/.test(text)) return "renovacoes";
  if (/ftth|fibra/.test(text)) return "ftth";
  if (/movel|celular/.test(text)) return "movel";
  if (/receita|faturamento/.test(text)) return "receita";
  return null;
}
export function parseRangeLabel(value) {
  const label = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const text = normalizedText(label);
  const numbers = [...text.matchAll(/\d[\d.,]*/g)].map((match) => {
    const token = match[0];
    return Number(
      token.includes(",")
        ? token.replaceAll(".", "").replace(",", ".")
        : /^\d{1,3}(?:\.\d{3})+$/.test(token)
          ? token.replaceAll(".", "")
          : token,
    );
  });
  if (!numbers.length || numbers.some((n) => !Number.isFinite(n)))
    throw new Error(`Faixa inválida: ${label || "vazia"}.`);
  const above = /acima de|mais de|superior a|^>(?!=)/.test(text);
  const below = /abaixo de|menos de|inferior a|^<(?!=)/.test(text);
  if (numbers.length === 1) {
    if (above) return { label, min: numbers[0], minExclusive: true };
    if (below) return { label, max: numbers[0], maxExclusive: true };
    if (/ou mais|ou superior|ou maior|>=|≥/.test(text)) return { label, min: numbers[0] };
    if (/ate|<=|≤/.test(text)) return { label, max: numbers[0] };
    return { label, min: numbers[0], max: numbers[0] };
  }
  if (numbers.length !== 2 || numbers[0] > numbers[1])
    throw new Error(`Intervalo inválido: ${label}.`);
  return {
    label,
    min: numbers[0],
    max: numbers[1],
    ...(above ? { minExclusive: true } : {}),
    ...(below ? { maxExclusive: true } : {}),
  };
}
function validateRanges(ranges, context) {
  for (let a = 0; a < ranges.length; a++)
    for (let b = a + 1; b < ranges.length; b++) {
      const left = ranges[a],
        right = ranges[b];
      const min = Math.max(left.min ?? 0, right.min ?? 0);
      const max = Math.min(left.max ?? Infinity, right.max ?? Infinity);
      const includes = (range) =>
        (range.min === undefined || (range.minExclusive ? min > range.min : min >= range.min)) &&
        (range.max === undefined || (range.maxExclusive ? min < range.max : min <= range.max));
      if (min < max || (min === max && includes(left) && includes(right)))
        throw new Error(`${context}: Q${a + 1} e Q${b + 1} possuem faixas sobrepostas.`);
    }
}
export function parseQuartilSheets(sheets, filename) {
  const rules = {
    experienced: { label: "Acima de 3 meses", metrics: {} },
    new: { label: "Até 3 meses", metrics: {} },
  };
  let rowsImported = 0;
  for (const sheet of sheets) {
    const headerIndex = sheet.rows.findIndex((row) =>
      [1, 2, 3, 4, 5].every((q) =>
        row.some((cell) => new RegExp(`^(Q|QUARTIL)${q}$`).test(normalizeHeader(cell))),
      ),
    );
    if (headerIndex < 0) continue;
    const headers = sheet.rows[headerIndex].map(normalizeHeader);
    const columns = [1, 2, 3, 4, 5].map((q) =>
      headers.findIndex((h) => new RegExp(`^(Q|QUARTIL)${q}$`).test(h)),
    );
    let tenure = null;
    for (const row of sheet.rows.slice(headerIndex + 1)) {
      const identifiers = row.filter((_, index) => !columns.includes(index)).join(" ");
      const text = normalizedText(identifiers);
      if (/acima de 3|mais de 3|experien/.test(text)) tenure = "experienced";
      else if (/abaixo de 3|ate 3|menos de 3|novo/.test(text)) tenure = "new";
      const metric = metricFor(identifiers);
      if (!metric || !tenure) continue;
      const ranges = columns.map((index) => parseRangeLabel(row[index]));
      validateRanges(ranges, `${sheet.name} · ${rules[tenure].label} · ${QUARTIL_LABELS[metric]}`);
      rules[tenure].metrics[metric] = ranges;
      rowsImported++;
    }
  }
  if (!rowsImported) return { kind: "snapshot", snapshot: buildQuartilSnapshot(sheets, filename) };
  for (const tenure of ["experienced", "new"]) {
    const metrics = rules[tenure].metrics;
    for (const metric of ["receita", "movel", "ftth"])
      if (!metrics[metric])
        throw new Error(`Informe as faixas de ${rules[tenure].label} · ${QUARTIL_LABELS[metric]}.`);
    metrics.renovacoes ??= metrics.movel.map((range) => ({ ...range }));
    metrics.receita_renovacoes ??= metrics.receita.map((range) => ({ ...range }));
    if (QUARTIL_METRICS.some((metric) => metrics[metric].length !== 5))
      throw new Error("Informe Q1 a Q5 para cada indicador.");
  }
  return {
    kind: "rules",
    rules,
    source: { report: filename, importedAt: new Date().toISOString() },
  };
}
