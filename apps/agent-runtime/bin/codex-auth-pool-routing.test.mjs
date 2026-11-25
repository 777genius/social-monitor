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
  describeCodexAuthPoolRunFailure,
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

test("exhausted attempt budget reports the capacity reason that blocked the run", () => {
  const message = describeCodexAuthPoolRunFailure({
    safeMessage: "Safe execution has no attempts remaining.",
    reason: "account_unavailable",
    failureDetails: {
      workerId: "social-monitor-agent-task:abc:slot-1",
      availability: "cooldown",
      reason: "quota_recheck_identity_changed",
      cooldownUntil: "2026-09-07T16:39:54.675Z",
      accountId: "account-i",
    },
    attemptCount: 1,
    accountCount: 1,
  });

  assert.match(message, /account_unavailable/u);
  assert.match(message, /Safe execution has no attempts remaining\./u);
  assert.match(message, /availability=cooldown/u);
  assert.match(message, /reason=quota_recheck_identity_changed/u);
  assert.match(message, /cooldownUntil=2026-09-07T16:39:54\.675Z/u);
  assert.match(message, /accountId=account-i/u);
  assert.match(message, /attempts=1\/1/u);
});

test("failure message keeps provider output and raw causes out of the message", () => {
  const message = describeCodexAuthPoolRunFailure({
    safeMessage: "Safe execution has no attempts remaining.",
    reason: "unknown_error",
    failureDetails: {
      availability: "cooldown",
      stderrTail: "sk-secret-looking-tail",
      stdoutTail: "reader summary prompt bytes",
      rawCause: "token=should-not-leak",
    },
    attemptCount: 1,
    accountCount: 1,
  });

  assert.match(message, /availability=cooldown/u);
  assert.doesNotMatch(message, /secret-looking-tail/u);
  assert.doesNotMatch(message, /prompt bytes/u);
  assert.doesNotMatch(message, /should-not-leak/u);
});

test("failure message survives a runtime result without classified details", () => {
  assert.equal(
    describeCodexAuthPoolRunFailure({
      safeMessage: "Safe execution will not retry external side effects.",
      reason: "budget_exceeded",
    }),
    "Codex auth pool run failed (budget_exceeded): " +
      "Safe execution will not retry external side effects.",
  );
  assert.equal(
    describeCodexAuthPoolRunFailure({}),
    "Codex auth pool run failed: no safe message",
  );
});

test("safe executor retries clean failures with the exact original job", () => {
  assert.equal(
    codexAuthPoolExecutionPolicy.continuationMode,
    "retry_original_job",
  );
  assert.equal(codexAuthPoolExecutionPolicy.retryUnknownCleanWorkspace, true);
  assert.equal(codexAuthPoolExecutionPolicy.retryUnknownChangedWorkspace, false);
});
