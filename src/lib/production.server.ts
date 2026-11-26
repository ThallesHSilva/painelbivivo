import { parseProductionCsv, productionNumber, type ProductionData } from "./production";

const SOURCE =
  "https://metabase.solucoes.plus/api/public/dashboard/80e613d3-76b0-439b-a312-dba89f48f737/dashcard/522/card/752/csv";
const cache = new Map<string, { expires: number; data: Promise<ProductionData> }>();
export function currentProductionMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}`;
}

export function loadProduction(month: string): Promise<ProductionData> {
  const existing = cache.get(month);
  if (existing && existing.expires > Date.now()) return existing.data;
  const data = fetchProduction(month).catch((error) => {
    cache.delete(month);
    throw error;
  });
  for (const [key, entry] of cache) if (entry.expires < Date.now()) cache.delete(key);
  if (cache.size >= 12) cache.delete(cache.keys().next().value!);
  cache.set(month, { expires: Date.now() + 60_000, data });
  return data;
}

async function fetchProduction(month: string): Promise<ProductionData> {
  const [year, number] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const response = await fetch(SOURCE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      format_rows: false,
      parameters: [
        {
          id: "3518c5d8",
          type: "date/all-options",
          target: ["dimension", ["template-tag", "data_ativacao"], { "stage-number": 0 }],
          value: `${month}-01~${month}-${lastDay}`,
        },
        {
          id: "3f9aa240",
          type: "date/all-options",
          target: ["dimension", ["template-tag", "data_atualizacao"], { "stage-number": 0 }],
          value: null,
        },
      ],
    }),
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/csv"))
    throw new Error("A origem de produção está indisponível. Tente novamente.");
  const [columns, ...records] = parseProductionCsv(await response.text());
  const required = [
    "GRUPO",
    "FILA",
    "NUMERO ATIVIDADE",
    "PROPRIETÁRIO DO PEDIDO",
    "EQUIPE",
    "VALOR UNIT",
    "QUANTIDADE",
    "PF OU PJ",
  ];
  if (!columns || required.some((column) => !columns.includes(column)))
    throw new Error("A estrutura da base de produção mudou. Verifique a integração.");
  const rows = records.map((record) => {
    if (record.length !== columns.length)
      throw new Error("Registro incompleto na base de produção.");
    const row = Object.fromEntries(columns.map((column, i) => [column, record[i]]));
    productionNumber(row["VALOR UNIT"]);
    productionNumber(row.QUANTIDADE);
    return row;
  });
  return { rows, columns, fetchedAt: new Date().toISOString(), month };
}
