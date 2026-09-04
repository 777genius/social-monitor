import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { orderCodexAuthAccountsForTask } from "./codex-auth-pool-routing.mjs";
import {
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanaryPurpose,
  readerPromotionV2CanarySchemaName,
  readerPromotionV2CanarySchemaVersion,
} from "./subscription-runtime-purpose-model-policy.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const bridgePath = join(
  repositoryRoot,
  "apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs",
);

test("main.30 control uses app-server turn/start then fallback exec", {
  timeout: 30_000,
}, async () => {
  const fixture = await createFixture();
  try {
    const result = await runBridge(fixture, standardRequest("control"), false);
    const attempts = await readAttempts(fixture.attemptLogPath);
    assert.equal(result.status, "completed");
    assert.equal(attempts.filter((item) => item.scenario === "control" &&
      item.command === "turn/start").length, 1);
    assert.equal(attempts.filter((item) => item.scenario === "control" &&
      item.command === "exec").length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("canary bypasses journals and executes one packaged exec on one account", {
  timeout: 30_000,
}, async () => {
  const fixture = await createFixture();
  try {
    const runId = taskIdSelecting(fixture.accountIds, "account-a", "valid");
    const journalPath = await seedCompletedJournal(fixture.stateRoot, runId);
    const beforeJournal = await readFile(journalPath, "utf8");
    const result = await runBridge(
      fixture,
      canaryRequest(runId, "valid"),
      true,
    );
    const attempts = await readAttempts(fixture.attemptLogPath);
    const native = attempts.filter((item) => item.scenario === "valid");

    assert.equal(result.status, "completed");
    assert.deepEqual(result.structuredOutput, validCanaryOutput);
    assert.equal(result.executionAttestation, undefined);
    assert.deepEqual(native.map(({ account, command }) => ({ account, command })), [
      { account: "account-a", command: "exec" },
    ]);
    assert.equal(native.some((item) => [
      "thread/start",
      "turn/start",
      "prewarm",
      "resume",
      "continuation",
    ].includes(item.command)), false);
    assert.equal(native[0].hasOutputSchema, true);
    assert.equal(await readFile(journalPath, "utf8"), beforeJournal);
  } finally {
    await fixture.cleanup();
  }
});

test("every canary failure shape remains one native attempt and one account", {
  timeout: 60_000,
}, async () => {
  const fixture = await createFixture();
  try {
    for (const scenario of [
      "provider",
      "reconnect",
      "refresh-conflict",
      "capacity",
      "timeout",
      "invalid",
      "generic",
    ]) {
      const runId = taskIdSelecting(fixture.accountIds, "account-a", scenario);
      const result = await runBridge(
        fixture,
        canaryRequest(runId, scenario),
        true,
      );
      assert.equal(result.status, "failed", scenario);
    }
    const attempts = await readAttempts(fixture.attemptLogPath);
    for (const scenario of [
      "provider",
      "reconnect",
      "refresh-conflict",
      "capacity",
      "timeout",
      "invalid",
      "generic",
    ]) {
      const native = attempts.filter((item) => item.scenario === scenario);
      assert.deepEqual(
        native.map(({ account, command }) => ({ account, command })),
        [{ account: "account-a", command: "exec" }],
        scenario,
      );
    }
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "reader-promotion-v2-lane-"));
  const sandbox = join(root, "sandbox");
  const stateRoot = join(root, "state");
  const poolRoot = join(root, "pool");
  const snapshot = join(poolRoot, "snapshots", "fixture-1");
  await Promise.all([
    mkdir(sandbox, { recursive: true, mode: 0o700 }),
    mkdir(stateRoot, { recursive: true, mode: 0o700 }),
    mkdir(snapshot, { recursive: true, mode: 0o700 }),
  ]);
  const accountIds = ["account-a", "account-b"];
  for (const account of accountIds) {
    const accountRoot = join(snapshot, account);
    await mkdir(accountRoot, { mode: 0o700 });
    await writeFile(join(accountRoot, "auth.json"), JSON.stringify({
      auth_mode: "chatgpt",
      last_refresh: new Date().toISOString(),
      tokens: {
        access_token: `fixture-access-${account}`,
        account_id: account,
        id_token: `fixture-id-${account}`,
        refresh_token: `fixture-refresh-${account}`,
        expiry: "2099-01-01T00:00:00.000Z",
      },
    }), { mode: 0o400 });
  }
  await writeFile(join(poolRoot, "current.json"), JSON.stringify({
    schemaVersion: 1,
    snapshotId: "fixture-1",
    accounts: accountIds.map((id) => ({
      id,
      relativePath: `snapshots/fixture-1/${id}/auth.json`,
    })),
  }), { mode: 0o400 });
  const attemptLogPath = join(root, "attempts.ndjson");
  const codexPath = join(root, "fake-codex.mjs");
  await writeFile(codexPath, fakeCodexSource(attemptLogPath), "utf8");
  await chmod(codexPath, 0o755);
  return {
    accountIds,
    attemptLogPath,
    codexPath,
    poolRoot,
    root,
    sandbox,
    stateRoot,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function runBridge(fixture, request, canary) {
  const requestPath = join(fixture.root, `${request.runId}.json`);
  await writeFile(requestPath, JSON.stringify(request), "utf8");
  const args = [
    bridgePath,
    "--provider", "codex",
    "--input", requestPath,
    "--format", "result-json",
    "--state-root", fixture.stateRoot,
    "--codex-binary", fixture.codexPath,
    "--model", "gpt-5.6-sol",
    "--timeout-ms", "10000",
    ...(canary ? ["--activate-reader-promotion-v2-canary"] : []),
  ];
  const execution = await execFileAsync(process.execPath, args, {
    cwd: fixture.sandbox,
    env: {
      PATH: process.env.PATH,
      LANG: "C.UTF-8",
      AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT: fixture.poolRoot,
      AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST: "current.json",
      AGENT_RUNTIME_REASONING_EFFORT: "high",
      SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY:
        Buffer.alloc(32, 9).toString("base64"),
    },
    maxBuffer: 1024 * 1024,
  }).catch((error) => ({ stdout: error.stdout ?? "", stderr: error.stderr ?? "" }));
  assert.notEqual(execution.stdout, "", execution.stderr);
  return JSON.parse(execution.stdout);
}

const standardRequest = (scenario) => ({
  protocolVersion: 1,
  runId: taskIdSelecting(["account-a", "account-b"], "account-a", scenario),
  cwd: ".",
  timeoutMs: 10_000,
  task: {
    kind: "structured-prompt",
    systemPrompt: "Return JSON only.",
    prompt: scenario,
    outputSchemaName: "control-schema",
    controls: {
      outputSchemaName: "control-schema",
      outputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
      },
    },
    metadata: {},
  },
  context: {
    application: "social-monitor",
    purpose: "social_monitor.reader_summary.generate.v2",
  },
});

const canaryRequest = (runId, scenario) => ({
  protocolVersion: 1,
  runId,
  cwd: ".",
  timeoutMs: 10_000,
  task: {
    kind: "structured-prompt",
    systemPrompt: "Return JSON only.",
    prompt: scenario,
    outputSchemaName: readerPromotionV2CanarySchemaName,
    controls: {
      outputSchemaName: readerPromotionV2CanarySchemaName,
      schemaVersion: readerPromotionV2CanarySchemaVersion,
      outputSchema: readerPromotionV2CanaryOutputSchema,
    },
    metadata: {},
  },
  context: { application: "social-monitor", purpose: readerPromotionV2CanaryPurpose },
});

const validCanaryOutput = {
  decisions: [{
    leftFeedItemId: "left-1",
    rightFeedItemId: "right-1",
    sameStory: true,
    confidenceScore: 0.99,
    rationale: "Same release.",
  }],
};

function taskIdSelecting(accounts, expected, suffix) {
  for (let index = 0; index < 10_000; index += 1) {
    const taskId = `canary-${suffix}-${index}`;
    if (orderCodexAuthAccountsForTask(accounts, taskId)[0] === expected) {
      return taskId;
    }
  }
  throw new Error("Unable to select fixture account");
}

async function seedCompletedJournal(stateRoot, taskId) {
  const hash = createHash("sha256").update(taskId).digest("hex");
  const path = join(
    stateRoot,
    "attempt-journal",
    "attempt-journal",
    `${hash}.json`,
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({
    taskId,
    workspaceRunId: `generic-${taskId}`,
    workspacePath: stateRoot,
    effectMode: "read_only",
    provider: "codex",
    status: "completed",
    result: { structuredOutput: { replayed: true } },
    attempts: [],
    startedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    completedAt: new Date(0).toISOString(),
  }), "utf8");
  return path;
}

async function readAttempts(path) {
  return (await readFile(path, "utf8").catch(() => ""))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function fakeCodexSource(attemptLogPath) {
  return `#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
const args = process.argv.slice(2);
const command = args[0];
const auth = JSON.parse(await readFile(join(process.env.CODEX_HOME, "auth.json"), "utf8"));
const account = auth.tokens.account_id;
const record = (value) => appendFile(${JSON.stringify(attemptLogPath)}, JSON.stringify({ account, ...value }) + "\\n");
if (command === "app-server") {
  const input = createInterface({ input: process.stdin });
  for await (const line of input) {
    const request = JSON.parse(line);
    if (request.method === "initialize") send({ id: request.id, result: {} });
    else if (request.method === "account/rateLimits/read") send({ id: request.id, result: { rateLimits: { primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: 4102444800 }, rateLimitReachedType: null } } });
    else if (request.method === "thread/start") { await record({ scenario: "control", command: "thread/start" }); send({ id: request.id, result: { thread: { id: "thread-control" } } }); }
    else if (request.method === "turn/start") { await record({ scenario: "control", command: "turn/start" }); send({ id: request.id, result: { turn: { id: "turn-control" } } }); send({ method: "turn/completed", params: { turn: { id: "turn-control", status: { type: "failed" }, error: { message: "ordinary failure" } } } }); }
  }
} else if (command === "exec") {
  const prompt = await readFile(0, "utf8");
  const scenario = ["control", "valid", "provider", "reconnect", "refresh-conflict", "capacity", "timeout", "invalid", "generic"].find((item) => prompt.includes(item)) || "generic";
  await record({ scenario, command: "exec", hasOutputSchema: args.includes("--output-schema") });
  const failures = {
    provider: "provider temporarily unavailable",
    reconnect: "reconnect required",
    "refresh-conflict": "session refresh conflict",
    capacity: "capacity unavailable",
    timeout: "task timeout",
    generic: "ordinary failure",
  };
  if (failures[scenario]) { process.stderr.write(failures[scenario] + "\\n"); process.exit(1); }
  const output = scenario === "control" ? { ok: true } : scenario === "invalid" ? { decisions: [{ sameStory: "yes" }] } : ${JSON.stringify(validCanaryOutput)};
  process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(output) } }) + "\\n");
} else { process.exit(88); }
function send(message) { process.stdout.write(JSON.stringify(message) + "\\n"); }
`;
}
