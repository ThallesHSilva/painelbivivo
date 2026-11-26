import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exportProductionCsv,
  orderCount,
  parseProductionCsv,
  productionNumber,
  productionCategory,
  isMobileActivation,
  isMigration,
  isFtth,
  isRenewal,
  revenue,
  sumProduction,
  type ProductionRow,
} from "./production.ts";

test("commercial groups use exact approved names, excluding similar groups", () => {
  assert.equal(productionCategory({ GRUPO: "Móvel Altas Totais" }), "Móvel");
  assert.equal(productionCategory({ GRUPO: "Móvel - Migração" }), "Migração");
  assert.equal(
    productionCategory({ GRUPO: "Fixa Básica Ativação Total - Voz | Dados | SVA" }),
    "Fixa Básica",
  );
  for (const GRUPO of [
    "Móvel Altas - Modem",
    "Alta Dados",
    "Móvel - Trocas",
    "Vivo Travel",
    "Móvel - Migração PP",
    "Fixa Básica PF Ativação Total - Voz | Dados | SVA",
  ]) {
    const row = { GRUPO };
    assert.equal(isMobileActivation(row), false);
    assert.equal(isMigration(row), false);
    assert.equal(isFtth(row), false);
    assert.equal(productionCategory(row), "Outros");
    assert.equal(isRenewal(row), false);
  }
});

test("CSV preserves quoted text, multiline fields, empty cells and escaped quotes", () => {
  assert.deepEqual(
    parseProductionCsv('\uFEFFa,b,c\r\n"cliente, filial","texto\ncom ""aspas""",\r\n'),
    [
      ["a", "b", "c"],
      ["cliente, filial", 'texto\ncom "aspas"', ""],
    ],
  );
  assert.throws(() => parseProductionCsv('a\n"incompleto'));
});
test("revenue multiplies unit price by quantity without counting product rows as distinct orders", () => {
  const rows: ProductionRow[] = [
    { "NUMERO ATIVIDADE": "S1", "VALOR UNIT": "12.50", QUANTIDADE: "3" },
    { "NUMERO ATIVIDADE": "S1", "VALOR UNIT": "10", QUANTIDADE: "2" },
    { "NUMERO ATIVIDADE": "S2", "VALOR UNIT": "0", QUANTIDADE: "1" },
  ];
  assert.equal(revenue(rows[0]), 37.5);
  assert.equal(sumProduction(rows), 57.5);
  assert.equal(orderCount(rows), 2);
  assert.throws(() => productionNumber("1.234,56"));
  assert.throws(() => productionNumber("NaN"));
});
test("export preserves identifiers and neutralizes spreadsheet formulas", () => {
  const result = parseProductionCsv(
    exportProductionCsv([{ id: "00123", name: '=HYPERLINK("x")' }], ["id", "name"]),
  );
  assert.equal(result[1][0], "00123");
  assert.equal(result[1][1], '\'=HYPERLINK("x")');
});
