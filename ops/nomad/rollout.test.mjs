import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
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

function createTrafficSwitchOverTempDir(dir, { validate, reload, lockTimeoutMs, lockPollIntervalMs } = {}) {
  const adapter = createNginxAdapter({
    includeDir: dir,
    allowedNamespace: ALLOWED_NAMESPACE,
    allowedJob: ALLOWED_JOB,
    allowedCidr: ALLOWED_CIDR,
    validate: validate ?? (async () => {}),
    reload: reload ?? (async () => {}),
    lockTimeoutMs,
    lockPollIntervalMs,
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
  getStableEndpointError = null,
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
      if (getStableEndpointError) {
        throw getStableEndpointError;
      }
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

test("trafficSwitch.inspect() failing before any switch is attempted is a clean failure, not a crash", async () => {
  const trafficSwitch = createTrafficSwitch({
    async inspect() {
      throw new Error("state file is corrupt");
    },
    async switch() {
      throw new Error("must not be called: inspect() already failed");
    },
    async restore() {
      throw new Error("must not be called");
    },
  });
  const nomad = createFakeNomad({
    candidateEndpoint: { allocId: "alloc-9", address: "172.20.0.14", port: 3000 },
  });

  const result = await runRelease({ nomad, trafficSwitch, manifest: manifest(), target: target(), jobHcl: JOB_HCL });

  assert.equal(result.outcome, "failed");
  assert.match(result.error, /state file is corrupt/);
  assert.equal(nomad.calls.promoteDeployment, 0);
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

test("a trafficSwitch.inspect() that resolves to undefined (not a throw) still yields a clean rolled-back outcome, not a crash", async () => {
  const trafficSwitch = createTrafficSwitch({
    async inspect() {
      return undefined; // malformed adapter: resolves, but with garbage
    },
    async switch() {
      throw new Error("nginx -t: [emerg] invalid directive");
    },
    async restore() {
      throw new Error("must not be called");
    },
  });
  const nomad = createFakeNomad({
    candidateEndpoint: { allocId: "alloc-10", address: "172.20.0.15", port: 3000 },
  });

  const result = await runRelease({
    nomad,
    trafficSwitch,
    manifest: manifest({ previousReleaseId: null }),
    target: target(),
    jobHcl: JOB_HCL,
  });

  assert.equal(result.outcome, "rolled-back");
  assert.equal(result.receipt.outcome, "rolled-back");
  assert.equal(result.receipt.configPreimage, COMPOSE_FALLBACK_MARKER, "must fall back to the rollback target, not crash on previousRoute.configPreimage");
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

test("reconcile tick keeps its documented never-throws contract when nomad.getStableEndpoint fails", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir);
    const nomad = createFakeNomad({ getStableEndpointError: new Error("nomad unreachable: ECONNREFUSED") });

    const outcome = await reconcileTick({ nomad, trafficSwitch, target: target() });

    assert.equal(outcome.changed, false);
    assert.match(outcome.reason, /ECONNREFUSED/);
  });
});

test("reconcile tick keeps its documented never-throws contract when trafficSwitch.inspect fails", async () => {
  const trafficSwitch = createTrafficSwitch({
    async inspect() {
      throw new Error("state file is corrupt");
    },
    async switch() {
      throw new Error("must not be called");
    },
    async restore() {
      throw new Error("must not be called");
    },
  });
  const nomad = createFakeNomad({ stableEndpoint: { allocId: "alloc-11", address: "172.20.0.16", port: 3000 } });

  const outcome = await reconcileTick({ nomad, trafficSwitch, target: target() });

  assert.equal(outcome.changed, false);
  assert.match(outcome.reason, /state file is corrupt/);
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

test("isAddressInCidr rejects whitespace hidden inside an octet, not just non-numeric garbage", async () => {
  const { isAddressInCidr } = await import("./adapters/nginx.mjs");
  // Number("5\n") === 5 and Number(" 5") === 5 (ToNumber trims whitespace),
  // so a naive Number(part) per octet would accept these and let a stray
  // newline/space reach the rendered nginx upstream config verbatim.
  assert.equal(isAddressInCidr("172.20.0.5\n", "172.20.0.0/16"), false);
  assert.equal(isAddressInCidr("172.20.0.5\r\n", "172.20.0.0/16"), false);
  assert.equal(isAddressInCidr("172.20. 0.5", "172.20.0.0/16"), false);
  assert.equal(isAddressInCidr(" 172.20.0.5", "172.20.0.0/16"), false);
  assert.equal(isAddressInCidr("172.20.0.5", "172.20.0.0/16"), true, "a genuinely clean address must still pass");
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

test("nginx adapter serializes concurrent switch() calls across the shared lock instead of interleaving them", async () => {
  await withTempIncludeDir(async (dir) => {
    let validateCallCount = 0;
    let releaseFirstValidate;
    const gate = new Promise((resolve) => {
      releaseFirstValidate = resolve;
    });
    const trafficSwitch = createTrafficSwitchOverTempDir(dir, {
      lockTimeoutMs: 2000,
      lockPollIntervalMs: 10,
      validate: async () => {
        validateCallCount += 1;
        if (validateCallCount === 1) {
          await gate; // first switch() holds the lock here until released below
        }
      },
    });

    const first = trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.11", port: 3000 });
    // Give the first call a chance to acquire the lock and enter validate().
    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.12", port: 3000 });
    // The second call must be blocked acquiring the lock, not racing ahead:
    // give it time to poll a few times, then prove it still has not written
    // its own state while the first call holds the lock.
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(existsSync(join(dir, "api-upstream.state.json")), false, "no switch has completed yet");

    releaseFirstValidate();
    await first;
    // The second call was rejected by the CAS check (it still expected
    // `null` as previous, but the first call already published) - proving
    // it genuinely waited for the lock instead of racing past it.
    await assert.rejects(() => second, /TrafficSwitchConflictError|conflict/i);

    const finalState = JSON.parse(readFileSync(join(dir, "api-upstream.state.json"), "utf8"));
    assert.equal(finalState.currentEndpoint.address, "172.20.0.11", "only the first call's write must have landed");
  });
});

test("restore() applies a known-good config and records its endpoint (not the unsupported RollbackReceipt shape)", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir);
    const knownGoodEndpoint = { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.30", port: 3000 };
    const knownGoodConfig = "# Managed by ops/nomad/adapters/nginx.mjs. Do not edit by hand.\nupstream social_monitor_api_nomad {\n  server 172.20.0.30:3000;\n}\n";

    const result = await trafficSwitch.restore({ configPreimage: knownGoodConfig, currentEndpoint: knownGoodEndpoint });

    assert.deepEqual(result, { restored: true });
    assert.equal(readFileSync(join(dir, "api-upstream.conf"), "utf8"), knownGoodConfig);
    const route = await trafficSwitch.inspect();
    assert.deepEqual(route.currentEndpoint, knownGoodEndpoint);
  });
});

test("restore() rolls back to whatever was active before, when the restore itself fails validation", async () => {
  await withTempIncludeDir(async (dir) => {
    let shouldFailValidate = false;
    const trafficSwitch = createTrafficSwitchOverTempDir(dir, {
      validate: async () => {
        if (shouldFailValidate) {
          throw new Error("nginx -t: [emerg] bad restore target");
        }
      },
    });
    await trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.20", port: 3000 });
    const contentBefore = readFileSync(join(dir, "api-upstream.conf"), "utf8");

    shouldFailValidate = true;
    await assert.rejects(
      () => trafficSwitch.restore({ configPreimage: "upstream broken {}\n", currentEndpoint: null }),
      /bad restore target/,
    );

    assert.equal(
      readFileSync(join(dir, "api-upstream.conf"), "utf8"),
      contentBefore,
      "a failed restore must roll the active config back to what was there before the attempt",
    );
    const route = await trafficSwitch.inspect();
    assert.equal(route.currentEndpoint.address, "172.20.0.20", "state must still reflect the pre-restore route, not the failed one");
  });
});

test("a first-ever publish that fails validation leaves no candidate file behind (nothing to restore to)", async () => {
  await withTempIncludeDir(async (dir) => {
    const trafficSwitch = createTrafficSwitchOverTempDir(dir, {
      validate: async () => {
        throw new Error("nginx -t: [emerg] invalid directive");
      },
    });

    await assert.rejects(
      () => trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.13", port: 3000 }),
      /invalid directive/,
    );

    assert.equal(existsSync(join(dir, "api-upstream.conf")), false, "an invalid, never-validated candidate must not be left on disk");
  });
});

test("switch() rolls the live config back if persisting the new state fails after a successful reload", async () => {
  await withTempIncludeDir(async (dir) => {
    let reloadCallCount = 0;
    const trafficSwitch = createTrafficSwitchOverTempDir(dir, {
      reload: async () => {
        reloadCallCount += 1;
        if (reloadCallCount === 2) {
          // Sabotage the state write that runRelease is about to attempt,
          // *after* this reload (the one for the second switch()) has
          // already succeeded: renaming a file onto an existing directory
          // always fails (EISDIR/ENOTEMPTY), standing in for disk-full or
          // permission failures without needing real disk exhaustion.
          // activePath is untouched, so the rollback write below and this
          // same reload() (called a third time, during that rollback) both
          // still succeed normally.
          rmSync(join(dir, "api-upstream.state.json"), { force: true });
          mkdirSync(join(dir, "api-upstream.state.json"));
        }
      },
    });
    await trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.21", port: 3000 });
    const contentBefore = readFileSync(join(dir, "api-upstream.conf"), "utf8");

    await assert.rejects(
      () =>
        trafficSwitch.switch(
          { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.21", port: 3000 },
          { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.22", port: 3000 },
        ),
      /failed to persist switch state/,
    );

    assert.equal(
      readFileSync(join(dir, "api-upstream.conf"), "utf8"),
      contentBefore,
      "nginx must be rolled back to the previous route when its own state bookkeeping cannot be persisted, not left serving an unrecorded route",
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
