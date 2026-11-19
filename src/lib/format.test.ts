import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtQscPct } from "./format.ts";

test("preserves reported QSC percentages at four fractional decimals", () => {
  assert.equal(fmtQscPct(0.0967), "9,67%");
  assert.equal(fmtQscPct(0.0093), "0,93%");
  assert.equal(fmtQscPct(-0.0967), "-9,67%");
  assert.equal(fmtQscPct(0), "0,00%");
});

test("still truncates extra source precision without treating missing values as zero", () => {
  assert.equal(fmtQscPct(9 / 93), "9,67%");
  assert.equal(fmtQscPct(0.00939999), "0,93%");
  assert.equal(fmtQscPct(-0.00939999), "-0,93%");
  for (const value of [null, undefined, NaN, Infinity]) assert.equal(fmtQscPct(value), "—");
});
