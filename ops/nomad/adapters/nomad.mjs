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
 * @param {{baseUrl?: string, token?: string|null, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>}} [options]
 */
export function createNomadClient({
  baseUrl = DEFAULT_BASE_URL,
  token = null,
  fetchImpl = fetch,
  sleep = defaultSleep,
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
    });
    const text = typeof response.text === "function" ? await response.text() : "";
    const parsed = text && text.length > 0 ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new NomadApiError(`${method} ${path} failed with status ${response.status}`, {
        status: response.status,
        body: parsed,
      });
    }
    return parsed;
  }

  async function getJobAllocations(namespace, jobId) {
    const result = await request("GET", `/v1/job/${jobId}/allocations?namespace=${encodeURIComponent(namespace)}`);
    return (result ?? []).map((alloc) => ({
      allocId: alloc.ID,
      clientStatus: alloc.ClientStatus,
      isCanary: Boolean(alloc.DeploymentStatus?.Canary),
      healthy: alloc.DeploymentStatus?.Healthy ?? null,
    }));
  }

  async function getAllocationEndpoint(allocId, { port = 3000 } = {}) {
    const alloc = await request("GET", `/v1/allocation/${allocId}`);
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
        `/v1/job/${jobId}/plan?namespace=${encodeURIComponent(namespace)}`,
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
      const result = await request("POST", `/v1/job/${jobId}?namespace=${encodeURIComponent(namespace)}`, {
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
      const result = await request("GET", `/v1/deployment/${deploymentId}`);
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
      await request("POST", `/v1/deployment/promote/${deploymentId}`, { All: true });
      return { promoted: true };
    },

    async failDeployment(deploymentId) {
      await request("POST", `/v1/deployment/fail/${deploymentId}`, {});
      return { failed: true };
    },

    /**
     * Polls deployment status until Nomad reports a terminal-enough state to
     * act on. This never invents health: a request error or a timeout comes
     * back as `unknown`, and `release.mjs` treats `unknown` the same as
     * `unhealthy` for promotion purposes (fail closed).
     * @param {string} deploymentId
     * @param {{timeoutMs?: number, intervalMs?: number}} [options]
     */
    async waitForHealthy(deploymentId, { timeoutMs = 5 * 60 * 1000, intervalMs = 2000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      let lastStatus = "unknown";
      let lastDescription = "";
      for (;;) {
        try {
          const deployment = await request("GET", `/v1/deployment/${deploymentId}`);
          lastStatus = deployment?.Status ?? "unknown";
          lastDescription = deployment?.StatusDescription ?? "";
        } catch (error) {
          lastDescription = error instanceof Error ? error.message : String(error);
        }
        if (lastStatus === "running" || lastStatus === "successful") {
          return createHealthResult({
            status: "healthy",
            checkedAt: new Date(),
            reason: lastDescription,
            observedAllocation: deploymentId,
          });
        }
        if (lastStatus === "failed" || lastStatus === "cancelled") {
          return createHealthResult({
            status: "unhealthy",
            checkedAt: new Date(),
            reason: lastDescription || lastStatus,
            observedAllocation: deploymentId,
          });
        }
        if (Date.now() >= deadline) {
          return createHealthResult({
            status: "unknown",
            checkedAt: new Date(),
            reason: `timed out waiting for deployment status (last=${lastStatus})`,
            observedAllocation: deploymentId,
          });
        }
        await sleep(intervalMs);
      }
    },
  });
}
