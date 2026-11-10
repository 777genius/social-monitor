import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createDurableBackendHttpClient } from "./durable-backend-e2e-http-client.ts";

const baseUrl = "http://127.0.0.1:3499";
const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const client = (delay = async () => {}) => createDurableBackendHttpClient({ apiBaseUrl: baseUrl }, { isRecord, delay });
async function usingFetch(fake, run) {
  const old = globalThis.fetch;
  globalThis.fetch = fake;
  try { await run(); } finally { globalThis.fetch = old; }
}

test("GET and POST preserve path, header, request-body and successful JSON contracts", async () => {
  const calls = [];
  await usingFetch(async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('{"ok":true}', { status: 200 });
  }, async () => {
    assert.deepEqual(await client().requestJson("GET", "/items", { headers: { "x-tenant-id": "scope" } }), { ok: true });
    assert.deepEqual(await client().requestJson("POST", "/items", { headers: { authorization: "Bearer test" }, body: { name: "demo" } }), { ok: true });
  });
  assert.equal(calls[0].url, baseUrl + "/items");
  assert.deepEqual(calls[0].options.headers, { accept: "application/json", "x-tenant-id": "scope" });
  assert.equal(calls[0].options.body, undefined);
  assert.deepEqual(calls[1].options.headers, { accept: "application/json", authorization: "Bearer test", "content-type": "application/json" });
  assert.equal(calls[1].options.body, '{"name":"demo"}');
});

test("429 retry honors Retry-After and polls at the same request boundary", async () => {
  let requests = 0;
  const waits = [];
  await usingFetch(async () => ++requests === 1
    ? new Response('{"details":{"retryAfterSeconds":9}}', { status: 429, headers: { "retry-after": "2" } })
    : new Response('{"state":"done"}', { status: 200 }), async () => {
    const seen = [];
    const result = await client(async (ms) => { waits.push(ms); }).pollJson("/job", {}, (v) => {
      seen.push(v);
      return v.state === "done" ? v : undefined;
    }, { timeoutMs: 5_000, label: "job" });
    assert.deepEqual(result, { state: "done" });
    assert.equal(seen.length, 1);
  });
  assert.equal(requests, 2);
  assert.ok(waits[0] > 0 && waits[0] <= 2_000);
});

test("429 falls back to valid response details when header missing", async () => {
  await usingFetch(async () => new Response('{"details":{"retryAfterSeconds":3}}', { status: 429 }), async () => {
    await assert.rejects(client().requestJson("GET", "/limited", { headers: {} }), /HTTP 429; retryAfterSeconds=3/);
  });
});

test("403, array response, empty body and offline errors retain original outcomes", async () => {
  await usingFetch(async () => new Response('{"reason":"denied"}', { status: 403 }), async () => {
    await assert.rejects(client().requestJson("GET", "/private", { headers: {} }), /GET \/private failed with HTTP 403/);
    await assert.rejects(client().requestJsonWithContext("evidence", "GET", "/private", { headers: {} }), /evidence: GET \/private failed with HTTP 403/);
  });
  await usingFetch(async () => new Response("[]", { status: 200 }), async () => {
    await assert.rejects(client().requestJson("GET", "/invalid", { headers: {} }), /did not return a JSON object/);
  });
  await usingFetch(async () => new Response("", { status: 200 }), async () => {
    assert.deepEqual(await client().requestJson("GET", "/empty", { headers: {} }), {});
  });
  await usingFetch(async () => { throw new TypeError("offline"); }, async () => {
    await assert.rejects(client().requestJson("GET", "/down", { headers: {} }), /GET \/down request failed: offline/);
    await assert.rejects(client().requestStatus("/down", {}), /GET \/down request failed: offline/);
  });
});

test("raw status probe and expired polling do not reinterpret HTTP status", async () => {
  let requests = 0;
  await usingFetch(async (_url, opts) => {
    requests++;
    assert.equal(opts.method, "GET");
    return new Response("denied", { status: 401 });
  }, async () => {
    assert.equal(await client().requestStatus("/status", { "x-workspace-id": "scope" }), 401);
    await assert.rejects(client().pollJson("/expired", {}, () => undefined, { timeoutMs: 0, label: "deadline" }), /deadline did not complete before timeout; last=\{\}/);
  });
  assert.equal(requests, 1);
});

test("CLI binds all four original methods from exactly one HTTP client factory", () => {
  const src = readFileSync(fileURLToPath(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url)), "utf8");
  assert.equal(src.split("createDurableBackendHttpClient(config, { isRecord, delay })").length - 1, 1);
  for (const name of ["pollJson", "requestStatus", "requestJsonWithContext", "requestJson"]) {
    assert.ok(src.includes(name), name);
    assert.equal(src.includes("function " + name + "("), false, name);
  }
});
