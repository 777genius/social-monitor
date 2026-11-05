import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SubscriptionWorkerError } from "@vioxen/subscription-runtime/worker-core";
import { runSubscriptionAgentTaskCli } from "../../../node_modules/@vioxen/subscription-runtime/dist/worker-local/agent-task-runner/cli.js";
import { subscriptionRuntimeFailureDetails } from "./subscription-runtime-failure-details.mjs";

const require = createRequire(import.meta.url);
require("ts-node").register({ transpileOnly: true, compilerOptions: { rootDir: process.cwd() } });
require("tsconfig-paths/register");
const { parseSubscriptionRuntimeCliResult } = require("../src/subscription-runtime-cli-support.ts");
const { SubscriptionRuntimeCliExecutor } = require("../src/subscription-runtime-cli-executor.ts");
const { admitSubscriptionRuntimeRequest } = require("../src/subscription-runtime-purpose-model-policy.ts");
const { assessmentRequest } = require("../src/source-content-assessment-runtime.spec-support.ts");

// Exercise the installed CLI's actual catch/factory/serialization with an inert
// worker. No pool, auth, provider process or runtime service is created.
// Leave work time above the 20s assessment cleanup reserve for classification.
async function serializeFailure(result) {
  const sandbox = await mkdtemp(join(tmpdir(), "classification-boundary-"));
  const request = { ...assessmentRequest(), timeoutMs: 60_000 };
  const canonical = admitSubscriptionRuntimeRequest(request).canonicalRequest;
  const output = [];
  let calls = 0;
  let disposals = 0;
  try {
    const exitCode = await runSubscriptionAgentTaskCli(
      ["--provider", "codex", "--format", "result-json", "--ephemeral", "--state-root", sandbox],
      {
        cwd: () => sandbox, env: () => ({}),
        readStdin: async () => JSON.stringify(canonical),
        writeStdout: (chunk) => output.push(chunk), writeStderr: () => {},
      },
      () => ({
        start: async () => {},
        run: async () => {
          calls++;
          throw new SubscriptionWorkerError("subscription_worker_run_failed", "Synthetic capacity failure", {
            details: subscriptionRuntimeFailureDetails(result),
          });
        },
        dispose: async () => { disposals++; },
      }),
    );
    assert.equal(exitCode, 1);
    assert.equal(calls, 1);
    assert.equal(disposals, 1);
    return { stdout: output.join(""), exitCode, request };
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

async function finalAssessment(t, serialized) {
  const logs = [];
  // Only the OS transport is replaced: the executor consumes the real CLI bytes
  // through runCli and cliExecutionResult, then applies its assessment policy.
  const spawn = t.mock.method(childProcess, "spawn", () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    globalThis.queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(serialized.stdout));
      child.emit("close", serialized.exitCode, null);
    });
    return child;
  });
  const installation = {
    executablePath: "/synthetic/classification-cli", packageRootRealpath: "/synthetic",
    runtimePackageVersion: "0.1.0-main.41", launcherSha256: "a".repeat(64),
  };
  const executor = new SubscriptionRuntimeCliExecutor({
    command: installation.executablePath, ephemeral: false,
    installationInspector: { inspect: async () => installation },
    logger: Object.fromEntries(["info", "warn", "error", "debug"].map((level) =>
      [level, (...args) => logs.push(args)])),
  });
  try {
    const result = await executor.execute(serialized.request);
    assert.equal(spawn.mock.callCount(), 1, "assessment must never replay the request");
    assert.equal(result.failure.retryable, false);
    assert.equal(result.executionAttestation, undefined);
    return { result, logs };
  } finally {
    spawn.mock.restore();
  }
}

for (const [reason, code] of [
  ["account_unavailable", "provider_session_invalid"],
  ["capacity_unavailable", "backend_unavailable"],
  ["quota_limited", "quota_limited"],
]) {
  test(`${reason} survives CLI serialization and assessment remains nonretryable`, async (t) => {
    const serialized = await serializeFailure({
      status: "waiting_capacity", reason,
      failureDetails: {
        reason: "quota_recheck_identity_changed", availability: "cooldown",
        cooldownUntil: "2026-09-08T12:00:00.000Z",
        safeExecutorStatus: "failed", capacityReason: "spoofed-detail",
        accountId: "synthetic-account-omit", auth: "synthetic-auth-omit",
        providerPayload: { value: "synthetic-provider-omit" }, stderrTail: "synthetic-stderr-omit",
      },
    });
    const envelope = JSON.parse(serialized.stdout);
    assert.equal(envelope.failure.code, "unknown_runtime_failure");
    assert.equal(envelope.failure.retryable, false);
    const parsed = parseSubscriptionRuntimeCliResult(serialized.stdout);
    assert.equal(parsed.failure.code, code);
    assert.equal(parsed.failure.retryable, true);
    const { result, logs } = await finalAssessment(t, serialized);
    assert.equal(result.failure.code, code);
    assert.equal(result.failure.reconnectRequired, false);
    assert.deepEqual(result.failure.details, {
      reason, capacityReason: "quota_recheck_identity_changed",
      safeExecutorStatus: "waiting_capacity", availability: "cooldown",
      cooldownUntil: "2026-09-08T12:00:00.000Z",
      subscriptionWorkerCode: "subscription_worker_run_failed",
    });
    for (const surface of [serialized.stdout, JSON.stringify(result), JSON.stringify(logs)]) {
      for (const omitted of ["synthetic-account-omit", "synthetic-auth-omit", "synthetic-provider-omit",
        "synthetic-stderr-omit", "spoofed-detail"]) assert.equal(surface.includes(omitted), false);
    }
  });
}

test("absent or unrecognized details cannot invent a classified account failure", async (t) => {
  for (const failureDetails of [undefined, null, {
    reason: "account_unavailable", safeExecutorStatus: "waiting_capacity",
    availability: "synthetic-private-value", cooldownUntil: "synthetic-private-value",
  }]) {
    const serialized = await serializeFailure({ status: "failed", reason: "unknown_error", failureDetails });
    const { result } = await finalAssessment(t, serialized);
    assert.equal(result.failure.code, "unknown_runtime_failure");
    assert.deepEqual(result.failure.details, {
      reason: "unknown_error", safeExecutorStatus: "failed",
      subscriptionWorkerCode: "subscription_worker_run_failed",
    });
  }
});

test("unrecognized code values are not exported as diagnostic data", async (t) => {
  const serialized = await serializeFailure({
    reason: "synthetic-private-value", status: "synthetic-private-value",
    failureDetails: { reason: "synthetic-private-value", availability: {}, cooldownUntil: [] },
  });
  const { result } = await finalAssessment(t, serialized);
  assert.equal(result.failure.code, "unknown_runtime_failure");
  assert.equal(serialized.stdout.includes("synthetic-private-value"), false);
  assert.deepEqual(result.failure.details, { subscriptionWorkerCode: "subscription_worker_run_failed" });
});

for (const key of ["capacityReason", "safeExecutorStatus"]) {
  test(`backend rejects malformed ${key} in direct CLI envelopes and final logs`, async (t) => {
    const marker = "synthetic-private-provider-auth-marker";
    for (const value of [marker, "", null, 17, true, [marker], { value: marker },
      "account_unavailable", "constructor", "toString"]) {
      // Bypass the wrapper helper: this JSON is the untrusted CLI boundary.
      const details = {
        reason: "account_unavailable", capacityReason: "quota_recheck_identity_changed",
        safeExecutorStatus: "waiting_capacity", availability: "cooldown",
        cooldownUntil: "2026-09-08T12:00:00.000Z",
        subscriptionWorkerCode: "subscription_worker_run_failed", [key]: value,
      };
      const expected = { ...details };
      delete expected[key];
      const serialized = {
        stdout: JSON.stringify({
          status: "failed", warnings: [], failure: {
            code: "unknown_runtime_failure", safeMessage: "Synthetic failure",
            retryable: false, details,
          },
        }),
        exitCode: 1, request: { ...assessmentRequest(), timeoutMs: 60_000 },
      };
      const parsed = parseSubscriptionRuntimeCliResult(serialized.stdout);
      assert.deepEqual(parsed.failure.details, expected);
      assert.equal(parsed.failure.code, "provider_session_invalid");
      const { result, logs } = await finalAssessment(t, serialized);
      assert.deepEqual(result.failure.details, expected);
      assert.equal(result.failure.code, "provider_session_invalid");
      assert.equal(result.failure.reconnectRequired, false);
      const finalLog = logs.find(([message]) => message === "agent runtime task did not complete");
      assert.ok(finalLog, "the final failure log must actually be emitted");
      assert.deepEqual(JSON.parse(finalLog[1].failureDetails), expected);
      for (const surface of [parsed, result, logs]) {
        assert.equal(JSON.stringify(surface).includes(marker), false);
      }
    }
  });
}
