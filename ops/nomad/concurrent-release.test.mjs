import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDeployTarget, createReleaseManifest, createTrafficSwitch } from "./contracts.mjs";
import { createNginxAdapter } from "./adapters/nginx.mjs";
import { readApiOwner, writeApiOwner } from "./ownership.mjs";
import { reconcileTick } from "./reconcile-traffic.mjs";
import { COMPOSE_FALLBACK_MARKER, runRelease } from "./release.mjs";

/**
 * Failure-drill scenarios from plan section 9 acceptance that are not
 * already exercised by rollout.test.mjs (candidate health, nginx
 * validate/reload failure, allocation IP change, untrusted endpoint,
 * first-ever deployment failure): concurrent/stale submissions, a fully
 * offline Nomad backend, and recovery after a mid-release crash. Every
 * scenario here uses in-memory/temp-dir fakes - no real Nomad agent,
 * nginx process, or production host.
 */

const VALID_SHA = "a".repeat(40);
const VALID_DIGEST = `sha256:${"c".repeat(64)}`;
const ALLOWED_NAMESPACE = "social-monitor";
const ALLOWED_JOB = "sm-api";
const ALLOWED_CIDR = "172.20.0.0/16";
const JOB_HCL = "job \"sm-api\" {}";

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

async function withTempDir(run) {
  const dir = mkdtempSync(join(tmpdir(), "sm-failure-drill-"));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function nginxSwitch(dir) {
  return createTrafficSwitch(
    createNginxAdapter({
      includeDir: dir,
      allowedNamespace: ALLOWED_NAMESPACE,
      allowedJob: ALLOWED_JOB,
      allowedCidr: ALLOWED_CIDR,
    }),
  );
}

/**
 * Models Nomad's own EnforceIndex/JobModifyIndex protection (plan section
 * 7: "-check-index protects against a stale plan"). `planJob` always
 * reports the index as of the moment it is called; `runJob` rejects unless
 * the caller's checkIndex still matches - exactly like the real Nomad HTTP
 * API rejecting a submission whose plan was observed before someone else's
 * release already advanced the job.
 */
function createIndexTrackingNomad() {
  let currentIndex = 1;
  let deploymentSeq = 0;
  const deployments = new Map();
  return {
    async planJob() {
      return { jobModifyIndex: currentIndex, warnings: "" };
    },
    async runJob(_namespace, _jobId, _jobHcl, { checkIndex } = {}) {
      if (checkIndex !== currentIndex) {
        throw new Error(`stale plan: checkIndex ${checkIndex} does not match current jobModifyIndex ${currentIndex}`);
      }
      deploymentSeq += 1;
      currentIndex += 1;
      const deploymentId = `deployment-${deploymentSeq}`;
      deployments.set(deploymentId, { address: `172.20.0.${10 + deploymentSeq}`, port: 3000 });
      return { evalId: `eval-${deploymentSeq}`, deploymentId, jobModifyIndex: currentIndex };
    },
    async waitForHealthy(deploymentId) {
      return { status: "healthy", checkedAt: new Date().toISOString(), reason: "", observedAllocation: deploymentId };
    },
    async getCandidateEndpoint(_namespace, _jobId) {
      const last = [...deployments.values()].at(-1);
      return last ? { allocId: "alloc", ...last } : null;
    },
    async getStableEndpoint() {
      // Nothing has been promoted in this fake yet: a canary allocation
      // existing is not the same as a promoted/stable one (plan section 4 -
      // reconcile only ever re-points nginx at a *stable* allocation).
      return null;
    },
    async promoteDeployment() {
      return { promoted: true };
    },
  };
}

test("concurrent releases: a stale checkIndex is rejected, the winner's route is not clobbered", async () => {
  await withTempDir(async (dir) => {
    const trafficSwitch = nginxSwitch(dir);
    const nomad = createIndexTrackingNomad();

    // Both callers observe the job at the same index before either submits -
    // this is the actual race the plan's "-check-index" contract guards
    // against, not a timing coincidence this test has to force.
    const [resultA, resultB] = await Promise.all([
      runRelease({ nomad, trafficSwitch, manifest: manifest(), target: target(), jobHcl: JOB_HCL }),
      runRelease({ nomad, trafficSwitch, manifest: manifest(), target: target(), jobHcl: JOB_HCL }),
    ]);

    const outcomes = [resultA.outcome, resultB.outcome].sort();
    assert.deepEqual(outcomes, ["failed", "promoted"], "exactly one concurrent submission may win");

    const loser = resultA.outcome === "failed" ? resultA : resultB;
    assert.match(loser.error, /stale plan|checkIndex/i);
    assert.equal(loser.receipt.outcome, "failed");

    // The route reflects exactly one release, never an undefined/mixed state.
    const route = await trafficSwitch.inspect();
    assert.ok(route.currentEndpoint, "the winning release must have published a route");
  });
});

test("nomad unreachable (registry/backend offline): explicit failed outcome, route and promotion untouched", async () => {
  await withTempDir(async (dir) => {
    const trafficSwitch = nginxSwitch(dir);
    await trafficSwitch.switch(null, { namespace: ALLOWED_NAMESPACE, jobId: ALLOWED_JOB, address: "172.20.0.9", port: 3000 });

    let promoteCalls = 0;
    const offlineNomad = {
      async planJob() {
        throw new Error("connect ECONNREFUSED 127.0.0.1:4646");
      },
      async runJob() {
        throw new Error("unreachable");
      },
      async waitForHealthy() {
        throw new Error("unreachable");
      },
      async getCandidateEndpoint() {
        throw new Error("unreachable");
      },
      async promoteDeployment() {
        promoteCalls += 1;
      },
    };

    const result = await runRelease({ nomad: offlineNomad, trafficSwitch, manifest: manifest(), target: target(), jobHcl: JOB_HCL });

    assert.equal(result.outcome, "failed");
    assert.equal(result.receipt.outcome, "failed");
    assert.match(result.error, /ECONNREFUSED|offline|nomad plan\/run\/health-poll failed/i);
    assert.equal(promoteCalls, 0, "an offline backend must never be told to promote");

    const route = await trafficSwitch.inspect();
    assert.equal(route.currentEndpoint.address, "172.20.0.9", "the existing route must survive a Nomad outage untouched");
  });
});

test("nomad unreachable on a first-ever deployment: explicit fallback target is Compose, not an invented Nomad release", async () => {
  await withTempDir(async (dir) => {
    const trafficSwitch = nginxSwitch(dir);
    const offlineNomad = {
      async planJob() {
        throw new Error("connect ETIMEDOUT 127.0.0.1:4646");
      },
    };

    const result = await runRelease({
      nomad: offlineNomad,
      trafficSwitch,
      manifest: manifest({ previousReleaseId: null }),
      target: target(),
      jobHcl: JOB_HCL,
    });

    assert.equal(result.outcome, "failed");
    assert.equal(result.receipt.previousReleaseId, null);
    assert.equal(result.receipt.configPreimage, COMPOSE_FALLBACK_MARKER, "no prior Nomad release exists to fall back to");

    const route = await trafficSwitch.inspect();
    assert.equal(route.currentEndpoint, null, "no route was ever published");
  });
});

test("recovery after a mid-release crash: no duplicate owner, reconcile stays a no-op until a real stable allocation exists", async () => {
  await withTempDir(async (dir) => {
    await withTempDir(async (deployState) => {
      const trafficSwitch = nginxSwitch(dir);
      const nomad = createIndexTrackingNomad();

      // Simulate the process dying right after Nomad accepted the submission
      // (candidate exists) but before this release ever reached the traffic
      // switch - call the adapter directly instead of runRelease() to model
      // "runRelease never returned".
      const plan = await nomad.planJob();
      await nomad.runJob(ALLOWED_NAMESPACE, ALLOWED_JOB, JOB_HCL, { checkIndex: plan.jobModifyIndex });

      // Ownership is a durable marker, not something this in-flight release
      // ever wrote to: a crash here must not leave the API with an
      // undefined or duplicate owner, and the MVP must never have flipped it
      // to "nomad" on its own (that switch is an explicit human step, plan
      // section 7 activation, outside this repo's automated paths).
      assert.equal(readApiOwner({ deployState }), "compose", "absence of a marker means compose, exactly as before this PR existed");

      // A reconcile tick running right after the "crash" must not invent a
      // route from the still-canary allocation: getStableEndpoint correctly
      // reports nothing promoted yet, so reconcile is a safe no-op.
      const tick = await reconcileTick({ nomad, trafficSwitch, target: target() });
      assert.equal(tick.changed, false);
      const route = await trafficSwitch.inspect();
      assert.equal(route.currentEndpoint, null, "reconcile must never publish a canary as if it were promoted");

      // A fresh retry after the "reboot" (same manifest, same job) completes
      // normally - the earlier half-finished attempt did not corrupt state.
      const retry = await runRelease({ nomad, trafficSwitch, manifest: manifest(), target: target(), jobHcl: JOB_HCL });
      assert.equal(retry.outcome, "promoted");
      assert.equal(readApiOwner({ deployState }), "compose", "MVP never auto-switches ownership, even after a successful Nomad release");
    });
  });
});

test("writeApiOwner rejects a malformed owner value instead of silently writing it", () => {
  // Defense in depth alongside ownership.test.mjs: a typo like
  // "nomad-canary" must never reach the durable marker file. The repo-wide
  // check that no *non-test source file* automates writeApiOwner("nomad")
  // lives in failure-drill.test.sh, which can grep every file at once.
  assert.throws(() => writeApiOwner("nomad-canary", { deployState: "/nonexistent" }), TypeError);
});
