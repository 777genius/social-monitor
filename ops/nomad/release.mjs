#!/usr/bin/env node
/**
 * Orchestrates the canary release sequence for `sm-api` (plan sections 4 and
 * 7): submit candidate -> wait for native health -> switch nginx traffic ->
 * verify -> promote. It depends only on the small ports this repo already
 * defines - `nomad` (adapters/nomad.mjs-shaped client) and `trafficSwitch`
 * (contracts.mjs `TrafficSwitch`) - so tests can supply fakes without a real
 * Nomad agent or nginx process (DIP).
 *
 * Hard invariant enforced here, not just documented: a candidate never
 * receives the nginx switch before Nomad reports it healthy, and Nomad is
 * never told to promote before the nginx switch actually succeeded.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createDeployTarget, createReleaseManifest, createRollbackReceipt } from "./contracts.mjs";

const COMPOSE_FALLBACK_MARKER = "compose-fallback";

/**
 * @param {{
 *   nomad: object,
 *   trafficSwitch: {inspect: Function, switch: Function, restore: Function},
 *   manifest: import("./contracts.mjs").ReleaseManifest,
 *   target: import("./contracts.mjs").DeployTarget,
 *   jobHcl: string,
 *   port?: number,
 *   healthTimeoutMs?: number,
 * }} params
 * @returns {Promise<{outcome: "promoted"|"failed"|"rolled-back", receipt: object, health: object}>}
 */
export async function runRelease({
  nomad,
  trafficSwitch,
  manifest,
  target,
  jobHcl,
  port = 3000,
  healthTimeoutMs = 5 * 60 * 1000,
}) {
  const rollbackTarget = manifest.previousReleaseId ?? COMPOSE_FALLBACK_MARKER;

  function failedBeforeSwitch(reason, error) {
    // Anything thrown here (stale `checkIndex`/EnforceIndex rejection,
    // Nomad/registry unreachable, a plan/run/health-poll network error) is
    // caught explicitly rather than left as an uncaught rejection: the
    // nginx route is guaranteed untouched (this all happens before the one
    // `trafficSwitch.switch()` call below), and the caller gets the same
    // "failed" shape it already gets for an unhealthy candidate - including
    // a concrete fallback target (previous release, or Compose on a
    // first-ever deployment) instead of a crash with no receipt.
    return {
      outcome: "failed",
      health: null,
      receipt: createRollbackReceipt({
        previousReleaseId: manifest.previousReleaseId,
        newReleaseId: manifest.sourceSha,
        jobId: target.jobId,
        deploymentId: "unknown",
        configPreimage: rollbackTarget,
        outcome: "failed",
      }),
      error: `${reason}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let plan;
  let run;
  let health;
  let candidateEndpoint;
  try {
    plan = await nomad.planJob(target.namespace, target.jobId, jobHcl);
    run = await nomad.runJob(target.namespace, target.jobId, jobHcl, {
      checkIndex: plan.jobModifyIndex,
    });
    health = await nomad.waitForHealthy(run.deploymentId, { timeoutMs: healthTimeoutMs });
  } catch (error) {
    return failedBeforeSwitch("nomad plan/run/health-poll failed (stale plan, offline, or rejected submission)", error);
  }

  if (health.status !== "healthy") {
    // Candidate never reached the nginx switch: the previous route (or, on
    // a first-ever deployment, the still-running Compose API) keeps serving
    // traffic untouched. Native `auto_revert` is Nomad's own job, not ours.
    return {
      outcome: "failed",
      health,
      receipt: createRollbackReceipt({
        previousReleaseId: manifest.previousReleaseId,
        newReleaseId: manifest.sourceSha,
        jobId: target.jobId,
        deploymentId: run.deploymentId ?? "unknown",
        configPreimage: rollbackTarget,
        outcome: "failed",
      }),
    };
  }

  try {
    candidateEndpoint = await nomad.getCandidateEndpoint(target.namespace, target.jobId, { port });
  } catch (error) {
    return failedBeforeSwitch("nomad getCandidateEndpoint failed (offline or rejected request)", error);
  }
  if (!candidateEndpoint) {
    return {
      outcome: "failed",
      health,
      receipt: createRollbackReceipt({
        previousReleaseId: manifest.previousReleaseId,
        newReleaseId: manifest.sourceSha,
        jobId: target.jobId,
        deploymentId: run.deploymentId ?? "unknown",
        configPreimage: rollbackTarget,
        outcome: "failed",
      }),
    };
  }

  const previousRoute = await trafficSwitch.inspect();
  const endpoint = {
    namespace: target.namespace,
    jobId: target.jobId,
    address: candidateEndpoint.address,
    port: candidateEndpoint.port,
  };

  let switchResult;
  try {
    switchResult = await trafficSwitch.switch(previousRoute.currentEndpoint ?? null, endpoint);
  } catch (error) {
    // The candidate is healthy per Nomad but the switch itself failed
    // (validation/reload/conflict): the route is guaranteed unchanged by
    // the nginx adapter's own restore-on-failure behavior. Do not promote a
    // job whose traffic was never actually cut over.
    return {
      outcome: "rolled-back",
      health,
      receipt: createRollbackReceipt({
        previousReleaseId: manifest.previousReleaseId,
        newReleaseId: manifest.sourceSha,
        jobId: target.jobId,
        deploymentId: run.deploymentId ?? "unknown",
        configPreimage: previousRoute.configPreimage ?? rollbackTarget,
        outcome: "rolled-back",
      }),
      error: error instanceof Error ? error.message : String(error),
    };
  }

  await nomad.promoteDeployment(run.deploymentId);

  return {
    outcome: "promoted",
    health,
    receipt: createRollbackReceipt({
      previousReleaseId: manifest.previousReleaseId,
      newReleaseId: manifest.sourceSha,
      jobId: target.jobId,
      deploymentId: run.deploymentId ?? "unknown",
      configPreimage: switchResult.configPreimage,
      outcome: "succeeded",
    }),
  };
}

export { COMPOSE_FALLBACK_MARKER };

/**
 * Loads and validates a release manifest file (`host/api-deploy.service`'s
 * `--manifest` argument) into the `ReleaseManifest`/`DeployTarget` contracts
 * this module needs, without touching Nomad/nginx. Exported so tests can
 * exercise manifest validation without a live host.
 * @param {string} manifestPath
 */
export function loadReleasePlan(manifestPath) {
  const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifest = createReleaseManifest({
    sourceSha: raw.sourceSha,
    image: raw.image,
    targetConfigHash: raw.targetConfigHash,
    previousReleaseId: raw.previousReleaseId ?? null,
  });
  const target = createDeployTarget({
    namespace: raw.target?.namespace,
    jobId: raw.target?.jobId,
    hostBinding: raw.target?.hostBinding,
  });
  if (typeof raw.jobHcl !== "string" || raw.jobHcl.trim().length === 0) {
    throw new TypeError("release manifest: \"jobHcl\" must be a non-empty rendered job spec string");
  }
  return { manifest, target, jobHcl: raw.jobHcl };
}

function usage() {
  process.stderr.write("Usage: release.mjs (--dry-run|--apply) --manifest PATH\n");
}

async function runCli(argv) {
  let mode = "";
  let manifestPath = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run" || arg === "--apply") {
      mode = arg.slice(2);
    } else if (arg === "--manifest") {
      i += 1;
      manifestPath = argv[i] ?? "";
    } else {
      usage();
      return 64;
    }
  }
  if (!mode || !manifestPath) {
    usage();
    return 64;
  }

  const plan = loadReleasePlan(manifestPath);

  if (mode === "dry-run") {
    process.stdout.write(
      `release dry-run: would submit ${plan.target.jobId} in namespace ${plan.target.namespace} ` +
        `at image ${plan.manifest.image.reference} (source ${plan.manifest.sourceSha}), ` +
        `previous release ${plan.manifest.previousReleaseId ?? COMPOSE_FALLBACK_MARKER}\n`,
    );
    return 0;
  }

  process.stderr.write(
    "release: --apply is not implemented by this PR; runRelease() is only exercised in-process via " +
      "ops/nomad/rollout.test.mjs with fake adapters. Wiring this CLI to a real Nomad/nginx host is a " +
      "separate, explicitly reviewed activation step (plan section 7).\n",
  );
  return 1;
}

const isMainModule = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`release: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}

export const SELF_PATH = fileURLToPath(import.meta.url);
