#!/usr/bin/env node
/**
 * One reconciliation tick for the nginx route (plan section 4). Native
 * Nomad service registration is not DNS and does not push updates to
 * nginx, so something has to notice when the promoted allocation's
 * container IP changes (restart, reschedule, native `auto_revert`) and
 * repoint the upstream. This file exports the pure, testable tick; the
 * always-on ~5s loop lives in `host/api-traffic.service`, which just calls
 * this function on an interval - keeping the interval itself untested here
 * would hide the actual reconciliation logic behind a timer.
 *
 * This never promotes/demotes a Nomad deployment and never invents an
 * endpoint: it only re-points nginx at whatever `nomad.getStableEndpoint`
 * reports, and only if that endpoint passes the same allowlist the adapter
 * already enforces on every switch.
 */

import { pathToFileURL } from "node:url";

/**
 * @param {{nomad: object, trafficSwitch: {inspect: Function, switch: Function}, target: import("./contracts.mjs").DeployTarget, port?: number}} params
 * @returns {Promise<{changed: boolean, endpoint?: object, reason: string}>}
 */
export async function reconcileTick({ nomad, trafficSwitch, target, port = 3000 }) {
  const stable = await nomad.getStableEndpoint(target.namespace, target.jobId, { port });
  if (!stable) {
    return { changed: false, reason: "no healthy stable allocation reported by nomad" };
  }

  const current = await trafficSwitch.inspect();
  const desiredEndpoint = {
    namespace: target.namespace,
    jobId: target.jobId,
    address: stable.address,
    port: stable.port,
  };

  const currentEndpoint = current.currentEndpoint ?? null;
  const isSameEndpoint =
    currentEndpoint &&
    currentEndpoint.address === desiredEndpoint.address &&
    currentEndpoint.port === desiredEndpoint.port &&
    currentEndpoint.namespace === desiredEndpoint.namespace &&
    currentEndpoint.jobId === desiredEndpoint.jobId;

  if (isSameEndpoint) {
    return { changed: false, reason: "route already points at the current stable allocation" };
  }

  try {
    await trafficSwitch.switch(currentEndpoint, desiredEndpoint);
  } catch (error) {
    return {
      changed: false,
      reason: `switch rejected: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return { changed: true, endpoint: desiredEndpoint, reason: "route repointed at new stable allocation" };
}

/**
 * Runs `reconcileTick` on a fixed interval until the process receives
 * SIGTERM/SIGINT. This is the only part `host/api-traffic.service` actually
 * executes; it is intentionally not covered by `rollout.test.mjs` (an
 * infinite loop isn't a unit test) - `reconcileTick` above carries all the
 * tested logic, this is just its untested timer shell.
 * @param {{nomad: object, trafficSwitch: object, target: object, intervalMs?: number, port?: number, log?: (line: string) => void}} params
 */
export async function runReconcileLoop({ nomad, trafficSwitch, target, intervalMs = 5000, port = 3000, log = console.log }) {
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  while (!stopped) {
    try {
      const outcome = await reconcileTick({ nomad, trafficSwitch, target, port });
      if (outcome.changed) {
        log(`reconcile-traffic: ${outcome.reason}`);
      }
    } catch (error) {
      log(`reconcile-traffic: tick failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }
}

const isMainModule = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) {
  process.stderr.write(
    "reconcile-traffic: standalone CLI wiring (real Nomad/nginx adapters) is a separate, explicitly " +
      "reviewed activation step (plan section 7); this PR only ships the tested runReconcileLoop/reconcileTick " +
      "functions for host/api-traffic.service to call once that wiring exists.\n",
  );
  process.exitCode = 1;
}
