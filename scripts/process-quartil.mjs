import fs from "node:fs/promises";
import path from "node:path";
import { readSpreadsheetSheets } from "./spreadsheet-reader.mjs";
import { parseQuartilSheets } from "./quartil-import.mjs";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Informe arquivo Quartil e destino.");
const result = parseQuartilSheets(
  await readSpreadsheetSheets(input, { includeReference: true }),
  path.basename(input),
);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(result));
console.log(
  JSON.stringify({
    type: result.kind,
    consultants: result.snapshot?.consultants.length ?? 0,
    months: result.snapshot?.months ?? [],
    warnings: result.snapshot?.warnings.length ?? 0,
  }),
);
