export type ProductionRow = Record<string, string>;
export type ProductionData = {
  rows: ProductionRow[];
  columns: string[];
  fetchedAt: string;
  month: string;
};

// RFC 4180: preserve quoted commas, escaped quotes, newlines and trailing empty fields.
export function parseProductionCsv(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (!field || quoted) quoted = !quoted;
      else field += c;
    } else if (!quoted && c === ",") {
      row.push(field);
      field = "";
    } else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      if (row.some(Boolean)) records.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV incompleto recebido da origem.");
  if (field || row.length) {
    row.push(field);
    records.push(row);
  }
  return records;
}

export const normalizeProduction = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
export function productionNumber(value: string): number {
  if (!value.trim()) return 0;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error("Valor numérico inválido na produção.");
  return result;
}
export const revenue = (row: ProductionRow) =>
  productionNumber(row["VALOR UNIT"]) * productionNumber(row.QUANTIDADE);
export const quantity = (row: ProductionRow) => productionNumber(row.QUANTIDADE);
export const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const integer = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export function productionCategory(row: ProductionRow) {
  if (isMobileActivation(row)) return "Móvel";
  if (isMigration(row)) return "Migração";
  if (isFtth(row)) return "Fixa Básica";
  const group = normalizeProduction(row.GRUPO);
  if (/aparelho|equipamento/.test(group)) return "Aparelhos";
  if (/office/.test(group)) return "Office";
  if (group === "ti") return "TI";
  if (/vivo tech/.test(group)) return "Vivo Tech";
  if (/voz negocio/.test(group)) return "VVN";
  if (/m2m/.test(group)) return "M2M";
  if (/avancada/.test(group)) return "Avançada";
  if (/fixa.*renovacao/.test(group)) return "Fixa";
  return "Outros";
}
export const isRenewal = (row: ProductionRow) =>
  /renovacao/.test(normalizeProduction(row.GRUPO)) || isMigration(row);
export const isMigration = (row: ProductionRow) => row.GRUPO === "Móvel - Migração";
export const isFtth = (row: ProductionRow) =>
  row.GRUPO === "Fixa Básica Ativação Total - Voz | Dados | SVA";
export const isMobileActivation = (row: ProductionRow) => row.GRUPO === "Móvel Altas Totais";
export const orderCount = (rows: ProductionRow[]) =>
  new Set(rows.map((row) => row["NUMERO ATIVIDADE"]).filter(Boolean)).size;
export const sumProduction = (rows: ProductionRow[], measure = revenue) =>
  rows.reduce((total, row) => total + measure(row), 0);
export function groupProduction(
  rows: ProductionRow[],
  key: (row: ProductionRow) => string,
  measure = revenue,
) {
  const groups = new Map<string, number>();
  for (const row of rows) {
    const name = key(row) || "Não informado";
    groups.set(name, (groups.get(name) ?? 0) + measure(row));
  }
  return [...groups].sort((a, b) => b[1] - a[1]);
}
export function exportProductionCsv(rows: ProductionRow[], columns: string[]) {
  const quote = (value: string) =>
    '"' +
    (/^[=+@\-\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? "'" + value : value).replaceAll(
      '"',
      '""',
    ) +
    '"';
  return (
    "\uFEFF" +
    [columns, ...rows.map((row) => columns.map((column) => row[column] ?? ""))]
      .map((row) => row.map(quote).join(","))
      .join("\r\n")
  );
}
