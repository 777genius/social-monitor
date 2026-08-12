import assert from "node:assert/strict";
import test from "node:test";

import {
  accountCapacityAwareWorkerFactory,
  BoundedSubscriptionWorkerPool,
  InMemoryWorkerAccountCapacityStore,
  SubscriptionWorkerError,
} from "@vioxen/subscription-runtime/worker-core";

import {
  codexAuthPoolExecutionPolicy,
  orderCodexAuthAccountsForTask,
} from "./codex-auth-pool-routing.mjs";

test("orders accounts deterministically across task identities", () => {
  const accounts = ["account-a", "account-b", "account-c"];
  const seenFirstAccounts = new Set();
  for (let index = 0; index < 30; index += 1) {
    const taskId = `summary-${index}`;
    const first = orderCodexAuthAccountsForTask(accounts, taskId)[0];
    seenFirstAccounts.add(first);
    assert.deepEqual(
      orderCodexAuthAccountsForTask(accounts, taskId),
      orderCodexAuthAccountsForTask(accounts, taskId),
    );
  }
  assert.deepEqual(seenFirstAccounts, new Set(accounts));
});

test("pool retries a quota failure on another account with the exact same job", async () => {
  const originalJob = Object.freeze({
    runId: "daily-summary:2026-08-11",
    prompt: "canonical prompt bytes",
    controls: Object.freeze({ responseFormat: "json", temperature: 0 }),
  });
  const receivedJobs = [];
  const capacities = [
    { availability: "available" },
    { availability: "available" },
  ];
  const pool = new BoundedSubscriptionWorkerPool({
    poolId: "quota-failover-contract",
    slots: 2,
    retryPolicy: {
      maxAttempts: 2,
      retryOnSlotCapacityUnavailable: true,
    },
    workerFactory: accountCapacityAwareWorkerFactory({
      accountCapacityStore: new InMemoryWorkerAccountCapacityStore(),
      workerFactory: ({ slotIndex, workerId }) => ({
        workerId,
        state: "started",
        start: async () => {},
        prewarm: async () => ({ status: "skipped" }),
        health: async () => ({ status: "healthy" }),
        capacity: () => capacities[slotIndex],
        dispose: async () => {},
        run: async (job) => {
          receivedJobs.push({ slotIndex, job });
          if (slotIndex === 0) {
            capacities[0] = {
              availability: "quota_exhausted",
              reason: "quota_limited",
            };
            throw new SubscriptionWorkerError(
              "subscription_worker_run_failed",
              "quota",
            );
          }
          return { outputText: "ok" };
        },
      }),
    }),
  });

  await pool.start();
  try {
    const result = await pool.run(originalJob);
    assert.equal(result.outputText, "ok");
    assert.deepEqual(
      receivedJobs.map(({ slotIndex }) => slotIndex),
      [0, 1],
    );
    assert.equal(receivedJobs[0].job, originalJob);
    assert.equal(receivedJobs[1].job, originalJob);
    assert.equal(receivedJobs[1].job.prompt, originalJob.prompt);
    assert.equal(receivedJobs[1].job.controls, originalJob.controls);
  } finally {
    await pool.dispose();
  }
});

test("safe executor does not create a continuation prompt around pool failover", () => {
  assert.equal(codexAuthPoolExecutionPolicy.maxAttempts, 1);
  assert.equal(codexAuthPoolExecutionPolicy.continuationMode, "disabled");
});
