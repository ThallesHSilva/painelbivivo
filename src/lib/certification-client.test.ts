import test, { after } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { INITIAL_CYCLES } from "./certification.ts";
import { loadCertificationPreview, saveCertificationPreview } from "./certification-client.ts";

const originalFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = originalFetch;
});
const cycle = (value: string) => ({
  ...INITIAL_CYCLES.current,
  oneShot: { ...INITIAL_CYCLES.current.oneShot, jan: value },
});

test("edits are serialized and the report reads only after the latest pending save", async () => {
  const events: string[] = [];
  const release: Array<() => void> = [];
  let stored = cycle("0");
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/certificacao/previa");
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      assert.equal(body.partnerId, undefined);
      events.push(`PUT:${body.payload.oneShot.jan}`);
      await new Promise<void>((resolve) => release.push(resolve));
      stored = body.payload;
      return Response.json({ saved: true });
    }
    events.push("GET");
    return Response.json({ preview: { payload: stored, updatedAt: "2026-11-19" } });
  };
  const first = saveCertificationPreview(cycle("1"));
  const second = saveCertificationPreview(cycle("2"), true);
  const report = loadCertificationPreview();
  await setImmediate();
  assert.deepEqual(events, ["PUT:1"]);
  release[0]();
  await first;
  await setImmediate();
  assert.deepEqual(events, ["PUT:1", "PUT:2"]);
  release[1]();
  await second;
  assert.equal(((await report).preview!.payload as typeof stored).oneShot.jan, "2");
  assert.deepEqual(events, ["PUT:1", "PUT:2", "GET"]);
});

test("a failed save does not block a retry or a subsequent load", async () => {
  let fail = true;
  globalThis.fetch = async (_url, options) => {
    if (options?.method === "PUT" && fail) {
      fail = false;
      return Response.json({ message: "Falha temporária" }, { status: 503 });
    }
    return Response.json(options?.method === "PUT" ? { saved: true } : { preview: null });
  };
  await assert.rejects(saveCertificationPreview(cycle("3")), /Falha temporária/);
  await saveCertificationPreview(cycle("3"));
  assert.equal((await loadCertificationPreview()).preview, null);
});
