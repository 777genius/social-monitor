#!/usr/bin/env node
/**
 * Thin Nomad HTTP API client for the `sm-api` vertical slice (plan sections
 * 4 and 7). This module only translates release.mjs/reconcile-traffic.mjs
 * calls into Nomad HTTP requests and Nomad's JSON responses back into small
 * plain objects (DIP: those callers depend on this narrow shape, not on the
 * Nomad wire format). It never decides whether a rollout is safe, never
 * touches nginx, and never shells out to the `nomad` CLI.
 *
 * The Nomad HTTP API is reachable only on loopback (see host/nomad.hcl), so
 * in production this client always talks to `http://127.0.0.1:4646`. Tests
 * inject a fake `fetchImpl`/`sleep` instead of a real Nomad agent - this
 * repository does not run a Nomad agent as part of its test suite.
 */

import { createHealthResult } from "../contracts.mjs";

const DEFAULT_BASE_URL = "http://127.0.0.1:4646";

export class NomadApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "NomadApiError";
    this.status = status ?? null;
    this.body = body ?? null;
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {{baseUrl?: string, token?: string|null, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>, requestTimeoutMs?: number, now?: () => Date}} [options]
 */
export function createNomadClient({
  baseUrl = DEFAULT_BASE_URL,
  token = null,
  fetchImpl = fetch,
  sleep = defaultSleep,
  requestTimeoutMs = 10_000,
  now = () => new Date(),
} = {}) {
  async function request(method, path, body) {
    const headers = { "content-type": "application/json" };
    if (token) {
      headers["X-Nomad-Token"] = token;
    }
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Without this, a stalled Nomad connection hangs the request forever,
      // defeating waitForHealthy's own polling deadline (it never gets a
      // chance to re-check Date.now() against that deadline mid-request).
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const text = typeof response.text === "function" ? await response.text() : "";
    let parsed = null;
    if (text && text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Nomad (or a proxy in front of it) can return a non-JSON body, e.g.
        // a plain-text error or an HTML error page. Fall back to the raw
        // text instead of throwing here, so a 409 (stale plan) or any other
        // error status still reaches the caller as a NomadApiError with its
        // body intact, rather than as an unrelated SyntaxError.
        parsed = text;
      }
    }
    if (!response.ok) {
      throw new NomadApiError(`${method} ${path} failed with status ${response.status}`, {
        status: response.status,
        body: parsed,
      });
    }
    return parsed;
  }

  async function getJobAllocations(namespace, jobId) {
    const result = await request(
      "GET",
      `/v1/job/${encodeURIComponent(jobId)}/allocations?namespace=${encodeURIComponent(namespace)}`,
    );
    return (result ?? []).map((alloc) => ({
      allocId: alloc.ID,
      clientStatus: alloc.ClientStatus,
      isCanary: Boolean(alloc.DeploymentStatus?.Canary),
      healthy: alloc.DeploymentStatus?.Healthy ?? null,
    }));
  }

  async function getAllocationEndpoint(allocId, { port = 3000 } = {}) {
    const alloc = await request("GET", `/v1/allocation/${encodeURIComponent(allocId)}`);
    const address = alloc?.NetworkStatus?.Address ?? null;
    if (!address) {
      return null;
    }
    return { allocId, address, port };
  }

  return Object.freeze({
    /**
     * Read-only plan. Never mutates the job; a `jobModifyIndex` mismatch on
     * the later `runJob` call means a stale plan (plan section 7).
     */
    async planJob(namespace, jobId, jobHcl) {
      const result = await request(
        "POST",
        `/v1/job/${encodeURIComponent(jobId)}/plan?namespace=${encodeURIComponent(namespace)}`,
        { Job: jobHcl, Diff: true },
      );
      return { jobModifyIndex: result?.JobModifyIndex ?? null, warnings: result?.Warnings ?? "" };
    },

    /**
     * Submits the job with `-check-index` semantics (`EnforceIndex`): the
     * write is rejected if the job changed since `planJob` observed
     * `checkIndex`, protecting against a concurrent/stale deploy (plan
     * section 7). Returns submission identifiers only - not health.
     */
    async runJob(namespace, jobId, jobHcl, { checkIndex } = {}) {
      const result = await request("POST", `/v1/job/${encodeURIComponent(jobId)}?namespace=${encodeURIComponent(namespace)}`, {
        Job: jobHcl,
        EnforceIndex: checkIndex !== undefined && checkIndex !== null,
        JobModifyIndex: checkIndex ?? undefined,
      });
      return {
        evalId: result?.EvalID ?? null,
        deploymentId: result?.DeploymentID ?? null,
        jobModifyIndex: result?.JobModifyIndex ?? checkIndex ?? null,
        warnings: result?.Warnings ?? "",
      };
    },

    async getDeployment(deploymentId) {
      const result = await request("GET", `/v1/deployment/${encodeURIComponent(deploymentId)}`);
      return {
        status: result?.Status ?? "unknown",
        statusDescription: result?.StatusDescription ?? "",
        taskGroups: result?.TaskGroups ?? {},
      };
    },

    getJobAllocations,
    getAllocationEndpoint,

    /**
     * Finds the current canary allocation for a job and resolves its
     * driver-mode network address (plan section 4: `address_mode="driver"`,
     * no new host ports). Returns `null` while no canary allocation is up
     * yet, so callers can keep polling instead of switching traffic early.
     */
    async getCandidateEndpoint(namespace, jobId, { port = 3000 } = {}) {
      const allocations = await getJobAllocations(namespace, jobId);
      const candidate = allocations.find((alloc) => alloc.isCanary && alloc.clientStatus === "running");
      if (!candidate) {
        return null;
      }
      return getAllocationEndpoint(candidate.allocId, { port });
    },

    /**
     * Finds the current promoted (non-canary) healthy allocation's endpoint,
     * used by reconcile-traffic.mjs after a restart/reschedule changes the
     * container IP.
     */
    async getStableEndpoint(namespace, jobId, { port = 3000 } = {}) {
      const allocations = await getJobAllocations(namespace, jobId);
      const stable = allocations.find(
        (alloc) => !alloc.isCanary && alloc.clientStatus === "running" && alloc.healthy !== false,
      );
      if (!stable) {
        return null;
      }
      return getAllocationEndpoint(stable.allocId, { port });
    },

    async promoteDeployment(deploymentId) {
      await request("POST", `/v1/deployment/promote/${encodeURIComponent(deploymentId)}`, { All: true });
      return { promoted: true };
    },

    async failDeployment(deploymentId) {
      await request("POST", `/v1/deployment/fail/${encodeURIComponent(deploymentId)}`, {});
      return { failed: true };
    },

    /**
     * Polls deployment status until Nomad reports a terminal-enough state to
     * act on. This never invents health: a request error or a timeout comes
     * back as `unknown`, and `release.mjs` treats `unknown` the same as
     * `unhealthy` for promotion purposes (fail closed).
     * @param {string} deploymentId
     * @param {{timeoutMs?: number, intervalMs?: number, groupName?: string}} [options]
     */
    async waitForHealthy(deploymentId, { timeoutMs = 5 * 60 * 1000, intervalMs = 2000, groupName = "api" } = {}) {
      const deadline = Date.now() + timeoutMs;
      let lastStatus = "unknown";
      let lastDescription = "";
      for (;;) {
        try {
          const deployment = await request("GET", `/v1/deployment/${encodeURIComponent(deploymentId)}`);
          lastStatus = deployment?.Status ?? "unknown";
          lastDescription = deployment?.StatusDescription ?? "";
          if (lastStatus === "running") {
            // Nomad marks a deployment "running" as soon as the canary
            // allocation is placed - well before its own health checks
            // pass. Without also checking the task group's canary health
            // counts, this would report "healthy" the moment a candidate
            // exists, letting release.mjs switch traffic to an unverified
            // allocation. Treat "running" as still-pending until the group's
            // healthy count actually reaches its desired canary count.
            const group = deployment?.TaskGroups?.[groupName];
            const desiredCanaries = group?.DesiredCanaries ?? 0;
            const healthyAllocs = group?.HealthyAllocs ?? 0;
            if (desiredCanaries <= 0 || healthyAllocs < desiredCanaries) {
              lastStatus = "pending";
            }
          }
        } catch (error) {
          lastDescription = error instanceof Error ? error.message : String(error);
        }
        if (lastStatus === "running" || lastStatus === "successful") {
          return createHealthResult({
            status: "healthy",
            checkedAt: now(),
            reason: lastDescription,
            observedAllocation: deploymentId,
          });
        }
        if (lastStatus === "failed" || lastStatus === "cancelled") {
          return createHealthResult({
            status: "unhealthy",
            checkedAt: now(),
            reason: lastDescription || lastStatus,
            observedAllocation: deploymentId,
          });
        }
        if (Date.now() >= deadline) {
          return createHealthResult({
            status: "unknown",
            checkedAt: now(),
            reason: `timed out waiting for deployment status (last=${lastStatus})`,
            observedAllocation: deploymentId,
          });
        }
        await sleep(intervalMs);
      }
    },
  });
}
