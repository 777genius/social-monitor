import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDeployTarget, createReleaseManifest, createTrafficSwitch } from "./contracts.mjs";
import { createNginxAdapter } from "./adapters/nginx.mjs";
import { reconcileTick } from "./reconcile-traffic.mjs";
import { COMPOSE_FALLBACK_MARKER, runRelease } from "./release.mjs";

const VALID_SHA = "a".repeat(40);
const VALID_DIGEST = `sha256:${"c".repeat(64)}`;
const ALLOWED_NAMESPACE = "social-monitor";
const ALLOWED_JOB = "sm-api";
const ALLOWED_CIDR = "172.20.0.0/16";
const JOB_HCL = "job \"sm-api\" {}"; // opaque to the fake nomad client below

function manifest(overrides = {}) {
  return createReleaseManifest({
    sourceSha: VALID_SHA,
    image: {
      registry: "ghcr.io",
      repository: "777genius/social-monitor-api",
      digest: VALID_DIGEST,
      platform: "linux/amd64",
    },
    targetConfigHash: "config-hash-1",
    previousReleaseId: "release-0",
    ...overrides,
  });
}

function target() {
  return createDeployTarget({
    namespace: ALLOWED_NAMESPACE,
    jobId: ALLOWED_JOB,
    hostBinding: { address: "127.0.0.1", port: 4646 },
  });
}

async function withTempIncludeDir(run) {
  const dir = mkdtempSync(join(tmpdir(), "sm-nginx-adapter-"));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function createTrafficSwitchOverTempDir(dir, { validate, reload } = {}) {
  const adapter = createNginxAdapter({
    includeDir: dir,
    allowedNamespace: ALLOWED_NAMESPACE,
    allowedJob: ALLOWED_JOB,
    allowedCidr: ALLOWED_CIDR,
    validate: validate ?? (async () => {}),
    reload: reload ?? (async () => {}),
  });
  return createTrafficSwitch(adapter);
}

/**
 * In-memory fake standing in for adapters/nomad.mjs's createNomadClient
 * return shape. release.mjs/reconcile-traffic.mjs only depend on this
 * shape (DIP), so no real Nomad agent is needed to test them.
 */
function createFakeNomad({
  healthResult,
  candidateEndpoint,
  stableEndpoint,
  onPromote = () => {},
  promoteDeploymentError = null,
} = {}) {
  const calls = { planJob: 0, runJob: 0, waitForHealthy: 0, promoteDeployment: 0 };
  return {
    calls,
    async planJob() {
      calls.planJob += 1;
      return { jobModifyIndex: 42, warnings: "" };
    },
    async runJob() {
      calls.runJob += 1;
      return { evalId: "eval-1", deploymentId: "deployment-1", jobModifyIndex: 43 };
    },
    async waitForHealthy() {
      calls.waitForHealthy += 1;
      return (
        healthResult ?? {
          status: "healthy",
          checkedAt: new Date().toISOString(),
          reason: "",
          observedAllocation: "deployment-1",
        }
      );
    },
    async getCandidateEndpoint() {
      return candidateEndpoint ?? null;
    },
    async getStableEndpoint() {
      return stableEndpoint ?? null;
    },
    async promoteDeployment(deploymentId) {
      calls.promoteDeployment += 1;
      if (promoteDeploymentError) {
        throw promoteDeploymentError;
      }
      onPromote(deploymentId);
      return { promoted: true };
    },
  };
}

test("happy path: healthy candidate switches traffic and promotes", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir);
    const nomad = createFakeNomad({
      candidateEndpoint: { allocId: "alloc-1", address: "172.20.0.5", port: 3000 },
    });

    const result = await runRelease({ nomad, trafficSwitch, manifest: manifest(), target: target(), jobHcl: JOB_HCL });

    assert.equal(result.outcome, "promoted");
    assert.equal(result.receipt.outcome, "succeeded");
    assert.equal(nomad.calls.promoteDeployment, 1);

    const route = await trafficSwitch.inspect();
    assert.equal(route.currentEndpoint.address, "172.20.0.5");
    assert.match(readFileSync(join(dir, "api-upstream.conf"), "utf8"), /172\.20\.0\.5:3000/);
  });
});

test("promoteDeployment failing after a successful traffic switch is reported as ambiguous, not silently promoted or rolled back", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir);
    const nomad = createFakeNomad({
      candidateEndpoint: { allocId: "alloc-7", address: "172.20.0.8", port: 3000 },
      promoteDeploymentError: new Error("nomad unreachable: connect ECONNREFUSED"),
    });

    const result = await runRelease({ nomad, trafficSwitch, manifest: manifest(), target: target(), jobHcl: JOB_HCL });

    assert.equal(result.outcome, "promotion-ambiguous");
    assert.equal(result.receipt.outcome, "unknown");
    assert.match(result.error, /ECONNREFUSED/);

    // Traffic already moved: the candidate is what nginx actually serves,
    // even though Nomad never confirmed the promotion. Silently reverting
    // it here would be just as wrong as claiming success.
    const route = await trafficSwitch.inspect();
    assert.equal(route.currentEndpoint.address, "172.20.0.8");
  });
});

test("unhealthy candidate: no traffic switch, no promotion, previous route untouched", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir);
    // Seed an existing route as if a previous release already promoted.
    await trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.9", port: 3000 });

    const nomad = createFakeNomad({
      healthResult: { status: "unhealthy", checkedAt: new Date().toISOString(), reason: "OOM", observedAllocation: "deployment-1" },
      candidateEndpoint: { allocId: "alloc-2", address: "172.20.0.6", port: 3000 },
    });

    const result = await runRelease({ nomad, trafficSwitch, manifest: manifest(), target: target(), jobHcl: JOB_HCL });

    assert.equal(result.outcome, "failed");
    assert.equal(result.receipt.outcome, "failed");
    assert.equal(nomad.calls.promoteDeployment, 0);

    const route = await trafficSwitch.inspect();
    assert.equal(route.currentEndpoint.address, "172.20.0.9", "route must still point at the previous release");
  });
});

test("nginx reload failure after a healthy candidate: route restored, no promotion", async () => {
  await withTempIncludeDir(async (dir) => {
    let reloadCallCount = 0;
    const trafficSwitch = createTrafficSwitchOverTempDir(dir, {
      reload: async () => {
        reloadCallCount += 1;
        if (reloadCallCount === 1) {
          // First reload: seeding the previous stable route below.
          return;
        }
        throw new Error("nginx -s reload: [emerg] could not open socket");
      },
    });
    await trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.9", port: 3000 });
    const routeBefore = await trafficSwitch.inspect();
    const contentBefore = readFileSync(join(dir, "api-upstream.conf"), "utf8");

    const nomad = createFakeNomad({
      candidateEndpoint: { allocId: "alloc-3", address: "172.20.0.7", port: 3000 },
    });

    const result = await runRelease({ nomad, trafficSwitch, manifest: manifest(), target: target(), jobHcl: JOB_HCL });

    assert.equal(result.outcome, "rolled-back");
    assert.equal(result.receipt.outcome, "rolled-back");
    assert.equal(nomad.calls.promoteDeployment, 0, "must not promote a job whose traffic switch failed");

    const routeAfter = await trafficSwitch.inspect();
    assert.deepEqual(routeAfter.currentEndpoint, routeBefore.currentEndpoint);
    assert.equal(readFileSync(join(dir, "api-upstream.conf"), "utf8"), contentBefore, "active include must be restored verbatim");
  });
});

test("reconcile tick repoints nginx after the stable allocation IP changes", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir);
    await trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.9", port: 3000 });

    const nomad = createFakeNomad({ stableEndpoint: { allocId: "alloc-4", address: "172.20.0.42", port: 3000 } });
    const outcome = await reconcileTick({ nomad, trafficSwitch, target: target() });

    assert.equal(outcome.changed, true);
    const route = await trafficSwitch.inspect();
    assert.equal(route.currentEndpoint.address, "172.20.0.42");
  });
});

test("reconcile tick refuses an endpoint outside the trusted subnet", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir);
    await trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.9", port: 3000 });

    const nomad = createFakeNomad({ stableEndpoint: { allocId: "alloc-5", address: "10.0.0.5", port: 3000 } });
    const outcome = await reconcileTick({ nomad, trafficSwitch, target: target() });

    assert.equal(outcome.changed, false);
    const route = await trafficSwitch.inspect();
    assert.equal(route.currentEndpoint.address, "172.20.0.9", "an untrusted endpoint must never become the route");
  });
});

test("reconcile tick is a no-op once nginx already points at the reported stable endpoint", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir);
    await trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.9", port: 3000 });

    const nomad = createFakeNomad({ stableEndpoint: { allocId: "alloc-6", address: "172.20.0.9", port: 3000 } });
    const outcome = await reconcileTick({ nomad, trafficSwitch, target: target() });

    assert.equal(outcome.changed, false);
  });
});

test("first-ever deployment failure rolls back to the Compose fallback marker, not an invented Nomad release", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir);
    const nomad = createFakeNomad({
      healthResult: { status: "unhealthy", checkedAt: new Date().toISOString(), reason: "crash loop", observedAllocation: "deployment-1" },
      candidateEndpoint: null,
    });

    const firstManifest = manifest({ previousReleaseId: null });
    const result = await runRelease({ nomad, trafficSwitch, manifest: firstManifest, target: target(), jobHcl: JOB_HCL });

    assert.equal(result.outcome, "failed");
    assert.equal(result.receipt.previousReleaseId, null);
    assert.equal(result.receipt.configPreimage, COMPOSE_FALLBACK_MARKER);

    const route = await trafficSwitch.inspect();
    assert.equal(route.currentEndpoint, null, "no route was ever published on a first deployment that never went healthy");
  });
});

test("candidate healthy but no resolvable network endpoint yet: treated as failed, not a crash", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir);
    const nomad = createFakeNomad({ candidateEndpoint: null });

    const result = await runRelease({ nomad, trafficSwitch, manifest: manifest(), target: target(), jobHcl: JOB_HCL });

    assert.equal(result.outcome, "failed");
    assert.equal(nomad.calls.promoteDeployment, 0);
  });
});

test("isAddressInCidr rejects malformed input instead of throwing", async () => {
  const { isAddressInCidr } = await import("./adapters/nginx.mjs");
  assert.equal(isAddressInCidr("not-an-ip", "172.20.0.0/16"), false);
  assert.equal(isAddressInCidr("172.20.0.5", "not-a-cidr"), false);
  assert.equal(isAddressInCidr("172.20.0.5", "172.20.0.0/16"), true);
  assert.equal(isAddressInCidr("172.21.0.5", "172.20.0.0/16"), false);
});

test("nginx adapter rejects a concurrent-modification switch (stale expectedPrevious)", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir);
    await trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.9", port: 3000 });

    await assert.rejects(
      () => trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.10", port: 3000 }),
      /TrafficSwitchConflictError|conflict/i,
    );
  });
});

test("existsSync sanity: adapter never mounts a single file, only writes inside includeDir", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir);
    await trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.9", port: 3000 });
    assert.equal(existsSync(join(dir, "api-upstream.conf")), true);
    assert.equal(existsSync(dir), true);
  });
});
