import assert from "node:assert/strict";
import test from "node:test";

import { NomadApiError, createNomadClient } from "./nomad.mjs";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body === undefined ? "" : JSON.stringify(body);
    },
  };
}

function fakeFetch(handlers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const handler = handlers.shift();
    if (!handler) {
      throw new Error(`unexpected extra request: ${url}`);
    }
    return handler(url, init);
  };
  fn.calls = calls;
  return fn;
}

test("planJob maps Nomad's plan response to jobModifyIndex/warnings", async () => {
  const fetchImpl = fakeFetch([
    async (url, init) => {
      assert.match(url, /\/v1\/job\/sm-api\/plan\?namespace=social-monitor$/);
      assert.equal(init.method, "POST");
      return jsonResponse(200, { JobModifyIndex: 7, Warnings: "" });
    },
  ]);
  const client = createNomadClient({ fetchImpl });
  const result = await client.planJob("social-monitor", "sm-api", "job \"sm-api\" {}");
  assert.deepEqual(result, { jobModifyIndex: 7, warnings: "" });
});

test("runJob sends EnforceIndex/JobModifyIndex from the supplied checkIndex", async () => {
  const fetchImpl = fakeFetch([
    async (url, init) => {
      assert.match(url, /\/v1\/job\/sm-api\?namespace=social-monitor$/);
      const body = JSON.parse(init.body);
      assert.equal(body.EnforceIndex, true);
      assert.equal(body.JobModifyIndex, 7);
      return jsonResponse(200, { EvalID: "eval-1", DeploymentID: "deploy-1", JobModifyIndex: 8 });
    },
  ]);
  const client = createNomadClient({ fetchImpl });
  const result = await client.runJob("social-monitor", "sm-api", "job \"sm-api\" {}", { checkIndex: 7 });
  assert.deepEqual(result, { evalId: "eval-1", deploymentId: "deploy-1", jobModifyIndex: 8, warnings: "" });
});

test("a non-2xx response raises NomadApiError with the status and parsed body", async () => {
  const fetchImpl = fakeFetch([
    async () => jsonResponse(409, { Error: "index mismatch" }),
  ]);
  const client = createNomadClient({ fetchImpl });
  await assert.rejects(
    () => client.runJob("social-monitor", "sm-api", "job \"sm-api\" {}", { checkIndex: 1 }),
    (error) => {
      assert.ok(error instanceof NomadApiError);
      assert.equal(error.status, 409);
      assert.equal(error.body.Error, "index mismatch");
      return true;
    },
  );
});

test("a non-JSON error body does not crash the client - it reaches NomadApiError as raw text", async () => {
  const fetchImpl = fakeFetch([
    async () => ({
      ok: false,
      status: 502,
      async text() {
        return "<html>502 Bad Gateway</html>";
      },
    }),
  ]);
  const client = createNomadClient({ fetchImpl });
  await assert.rejects(
    () => client.runJob("social-monitor", "sm-api", "job \"sm-api\" {}", { checkIndex: 1 }),
    (error) => {
      assert.ok(error instanceof NomadApiError);
      assert.equal(error.status, 502);
      assert.match(error.body, /502 Bad Gateway/);
      return true;
    },
  );
});

test("getCandidateEndpoint resolves the running canary allocation's driver-mode address", async () => {
  const fetchImpl = fakeFetch([
    async () =>
      jsonResponse(200, [
        { ID: "alloc-stable", ClientStatus: "running", DeploymentStatus: { Canary: false, Healthy: true } },
        { ID: "alloc-canary", ClientStatus: "running", DeploymentStatus: { Canary: true, Healthy: true } },
      ]),
    async (url) => {
      assert.match(url, /\/v1\/allocation\/alloc-canary$/);
      return jsonResponse(200, { NetworkStatus: { Address: "172.20.0.5" } });
    },
  ]);
  const client = createNomadClient({ fetchImpl });
  const endpoint = await client.getCandidateEndpoint("social-monitor", "sm-api", { port: 3000 });
  assert.deepEqual(endpoint, { allocId: "alloc-canary", address: "172.20.0.5", port: 3000 });
});

test("getCandidateEndpoint returns null while no canary allocation is running yet", async () => {
  const fetchImpl = fakeFetch([async () => jsonResponse(200, [])]);
  const client = createNomadClient({ fetchImpl });
  assert.equal(await client.getCandidateEndpoint("social-monitor", "sm-api"), null);
});

test("waitForHealthy stamps checkedAt from the injected clock, not a hidden new Date()", async () => {
  const fetchImpl = fakeFetch([
    async () =>
      jsonResponse(200, {
        Status: "successful",
        StatusDescription: "",
      }),
  ]);
  const fixedNow = new Date("2026-01-01T00:00:00.000Z");
  const client = createNomadClient({ fetchImpl, now: () => fixedNow });
  const health = await client.waitForHealthy("deploy-1", { intervalMs: 10, timeoutMs: 1000 });
  assert.equal(health.checkedAt, fixedNow.toISOString());
});

test("waitForHealthy polls until a terminal deployment status, sleeping between attempts", async () => {
  const statuses = ["pending", "running"];
  const fetchImpl = fakeFetch([
    async () => jsonResponse(200, { Status: statuses[0], StatusDescription: "" }),
    async () =>
      jsonResponse(200, {
        Status: statuses[1],
        StatusDescription: "canary healthy",
        TaskGroups: { api: { DesiredCanaries: 1, HealthyAllocs: 1 } },
      }),
  ]);
  const sleeps = [];
  const client = createNomadClient({ fetchImpl, sleep: async (ms) => sleeps.push(ms) });
  const health = await client.waitForHealthy("deploy-1", { intervalMs: 10, timeoutMs: 1000 });
  assert.equal(health.status, "healthy");
  assert.deepEqual(sleeps, [10]);
});

test("waitForHealthy keeps polling a 'running' deployment until the canary's own health count catches up", async () => {
  // Nomad flips Status to "running" the instant the canary is placed, long
  // before its health checks pass - a deployment status of "running" alone
  // must never be enough to call the candidate healthy.
  const fetchImpl = fakeFetch([
    async () =>
      jsonResponse(200, {
        Status: "running",
        StatusDescription: "canary placed",
        TaskGroups: { api: { DesiredCanaries: 1, HealthyAllocs: 0 } },
      }),
    async () =>
      jsonResponse(200, {
        Status: "running",
        StatusDescription: "canary healthy",
        TaskGroups: { api: { DesiredCanaries: 1, HealthyAllocs: 1 } },
      }),
  ]);
  const sleeps = [];
  const client = createNomadClient({ fetchImpl, sleep: async (ms) => sleeps.push(ms) });
  const health = await client.waitForHealthy("deploy-1", { intervalMs: 10, timeoutMs: 1000 });
  assert.equal(health.status, "healthy");
  assert.deepEqual(sleeps, [10]);
});

test("waitForHealthy reports unknown (not a crash) once the timeout elapses without a terminal status", async () => {
  const fetchImpl = fakeFetch([
    async () => jsonResponse(200, { Status: "pending", StatusDescription: "" }),
    async () => jsonResponse(200, { Status: "pending", StatusDescription: "" }),
  ]);
  let now = 0;
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    const client = createNomadClient({
      fetchImpl,
      sleep: async () => {
        now += 20;
      },
    });
    const health = await client.waitForHealthy("deploy-1", { intervalMs: 10, timeoutMs: 15 });
    assert.equal(health.status, "unknown");
  } finally {
    Date.now = originalNow;
  }
});
