import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { BoundedSubscriptionWorkerPool } from "@vioxen/subscription-runtime/worker-core";

// Execute the actual lease source and existing bounded pool with inert workers.
// No CLI, provider, credentials, database, or real child process is involved.
const source = await readFile(new URL("./source-content-assessment-execution-lease.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { assessmentExecutionWithLease } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("existing pool reserves only the cancelled caller's running slot and restores it on settlement", async () => {
  const owners = new Map();
  const attempts = [];
  const pool = new BoundedSubscriptionWorkerPool({
    poolId: "synthetic-assessment-pool", slots: 2, maxQueueSize: 1,
    retryPolicy: { maxAttempts: 1 },
    workerFactory: ({ workerId }) => ({
      workerId, state: "ready", start: async () => {}, dispose: async () => {},
      prewarm: async () => ({ workerId, status: "ready" }),
      health: async () => ({ workerId, status: "healthy", state: "ready", checkedAt: new Date(0) }),
      run: async (request) => new Promise((resolve) => {
        attempts.push(request.requestId);
        owners.set(request.requestId, () => {
          owners.delete(request.requestId);
          resolve({ status: "completed", warnings: [] });
        });
      }),
    }),
  });
  await pool.start();
  const run = assessmentExecutionWithLease({ execute: (request) => pool.run(request) });
  const request = (requestId) => ({
    requestId, tenantId: "sandbox-tenant", workspaceId: "sandbox-workspace",
    purpose: "social_monitor.relevance.assess_source_content.v1",
  });
  const drain = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const a = run(request("a"));
  const b = run(request("b"));
  await drain();
  assert.equal(pool.stats().inFlight, 2);
  assert.deepEqual(attempts, ["a", "b"]);
  // Transport cancellation abandons the response, not the executor promise.
  const caller = new globalThis.AbortController();
  caller.abort();
  assert.equal(caller.signal.aborted, true);
  assert.equal((await run(request("a"))).failure.code, "assessment_execution_leased");
  const c = run(request("c"));
  await drain();
  assert.equal(pool.stats().queued, 1);
  assert.equal(pool.stats().inFlight, 2);
  assert.deepEqual(attempts, ["a", "b"]);
  owners.get("b")();
  await b;
  await drain();
  assert.deepEqual(attempts, ["a", "b", "c"]);
  assert.equal(pool.stats().inFlight, 2);
  assert.equal((await run(request("a"))).failure.code, "assessment_execution_leased");
  owners.get("a")();
  owners.get("c")();
  await Promise.all([a, c]);
  const again = run(request("a"));
  await drain();
  owners.get("a")();
  await again;
  assert.deepEqual(attempts, ["a", "b", "c", "a"]);
  assert.equal(pool.stats().inFlight, 0);
  await pool.dispose();
});
