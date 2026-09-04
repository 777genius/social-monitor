import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

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

test("main.30 control starts app-server and fallback exec processes", {
  timeout: 30_000,
}, async () => {
  const fixture = await createFixture({
    freshness: "fresh",
    invocationId: "control-run",
  });
  try {
    const execution = await runBridge(
      fixture,
      standardRequest("control-run"),
      { authMode: "pool", canary: false },
    );
    const attempts = await readAttempts(fixture.attemptLogPath);

    assert.equal(execution.exitCode, 0, JSON.stringify({
      result: execution.result,
      attempts,
      stderr: execution.stderr,
    }));
    assert.equal(execution.result.status, "completed");
    assert.deepEqual(nativeStartups(attempts), [
      { invocationId: "control-run", account: "account-a", command: "app-server" },
      { invocationId: "control-run", account: "account-a", command: "exec" },
    ]);
    assert.equal(attempts.some(
      (item) => item.event === "rpc" && item.method === "turn/start",
    ), true);
    assert.equal(attempts.some(
      (item) => item.event === "prompt" && item.promptKind === "story",
    ), true);
  } finally {
    await fixture.cleanup();
  }
});

test("canary bypasses journals and runs one packaged story command", {
  timeout: 30_000,
}, async () => {
  const accountIds = ["account-a", "account-b"];
  const runId = taskIdSelecting(accountIds, "account-a", "valid");
  const fixture = await createFixture({ freshness: "fresh", invocationId: runId });
  try {
    const journalPath = await seedCompletedJournal(fixture.stateRoot, runId);
    const beforeJournal = await readFile(journalPath, "utf8");
    const execution = await runBridge(fixture, canaryRequest(runId, "valid"), {
      authMode: "pool",
      canary: true,
    });
    const attempts = await readAttempts(fixture.attemptLogPath);

    assert.equal(execution.exitCode, 0, JSON.stringify({
      result: execution.result,
      attempts,
      stderr: execution.stderr,
    }));
    assert.equal(execution.result.status, "completed");
    assert.deepEqual(execution.result.structuredOutput, validCanaryOutput);
    assert.equal(execution.result.executionAttestation, undefined);
    assert.deepEqual(nativeStartups(attempts), [
      { invocationId: runId, account: "account-a", command: "exec" },
    ]);
    assert.deepEqual(promptKinds(attempts), ["story"]);
    assert.equal(attempts.find((item) => item.event === "prompt")?.hasOutputSchema, true);
    assert.equal(await readFile(journalPath, "utf8"), beforeJournal);
  } finally {
    await fixture.cleanup();
  }
});

for (const authMode of ["pool", "single"]) {
  test(`fresh reconnect fails closed after one story process (${authMode})`, {
    timeout: 30_000,
  }, async () => {
    const runId = authMode === "pool"
      ? taskIdSelecting(["account-a", "account-b"], "account-a", "fresh-reconnect")
      : "single-fresh-reconnect";
    const fixture = await createFixture({ freshness: "fresh", invocationId: runId });
    try {
      const execution = await runBridge(
        fixture,
        canaryRequest(runId, "fresh-reconnect"),
        { authMode, canary: true },
      );
      const attempts = await readAttempts(fixture.attemptLogPath);

      assert.notEqual(execution.exitCode, 0);
      assert.equal(execution.result.status, "failed");
      assert.deepEqual(nativeStartups(attempts), [
        { invocationId: runId, account: "account-a", command: "exec" },
      ]);
      assert.deepEqual(promptKinds(attempts), ["story"]);
      assert.equal(attempts.some((item) => item.promptKind === "refresh-bootstrap"), false);
    } finally {
      await fixture.cleanup();
    }
  });

  test(`stale rotating auth consumes the only process before story (${authMode})`, {
    timeout: 30_000,
  }, async () => {
    const runId = authMode === "pool"
      ? taskIdSelecting(["account-a", "account-b"], "account-a", "stale-rotating")
      : "single-stale-rotating";
    const fixture = await createFixture({ freshness: "stale", invocationId: runId });
    try {
      const execution = await runBridge(
        fixture,
        canaryRequest(runId, "story-must-not-start"),
        { authMode, canary: true },
      );
      const attempts = await readAttempts(fixture.attemptLogPath);

      assert.notEqual(execution.exitCode, 0);
      assert.equal(execution.result.status, "failed");
      assert.deepEqual(nativeStartups(attempts), [
        { invocationId: runId, account: "account-a", command: "exec" },
      ]);
      assert.deepEqual(promptKinds(attempts), ["refresh-bootstrap"]);
      assert.equal(attempts.some((item) => item.promptKind === "story"), false);
      assert.equal(attempts.find(
        (item) => item.promptKind === "refresh-bootstrap",
      )?.rotatedSession, true);
    } finally {
      await fixture.cleanup();
    }
  });
}

async function createFixture({ freshness, invocationId }) {
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
  const authPaths = [];
  for (const account of accountIds) {
    const accountRoot = join(snapshot, account);
    const authPath = join(accountRoot, "auth.json");
    await mkdir(accountRoot, { mode: 0o700 });
    await writeFile(authPath, JSON.stringify(fakeAuth(account, freshness)), {
      mode: 0o400,
    });
    authPaths.push(authPath);
  }
  await writeFile(join(poolRoot, "current.json"), JSON.stringify({
    schemaVersion: 1,
    snapshotId: "fixture-1",
    accounts: accountIds.map((id) => ({
      id,
      relativePath: `snapshots/fixture-1/${id}/auth.json`,
    })),
  }), { mode: 0o400 });
  const singleAuthPath = join(root, "single-auth.json");
  await writeFile(
    singleAuthPath,
    JSON.stringify(fakeAuth("account-a", freshness)),
    { mode: 0o600 },
  );
  const attemptLogPath = join(root, "attempts.ndjson");
  const codexPath = join(root, "fake-codex.mjs");
  await writeFile(
    codexPath,
    fakeCodexSource(attemptLogPath, invocationId),
    "utf8",
  );
  await chmod(codexPath, 0o755);
  return {
    accountIds,
    authPaths,
    attemptLogPath,
    codexPath,
    poolRoot,
    root,
    sandbox,
    singleAuthPath,
    stateRoot,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function runBridge(fixture, request, { authMode, canary }) {
  const beforePoolAuth = authMode === "pool"
    ? await Promise.all(fixture.authPaths.map((path) => readFile(path, "utf8")))
    : undefined;
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
    ...(authMode === "single"
      ? ["--codex-auth-json", fixture.singleAuthPath]
      : []),
    ...(canary ? ["--activate-reader-promotion-v2-canary"] : []),
  ];
  const poolEnvironment = authMode === "pool"
    ? {
        AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT: fixture.poolRoot,
        AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST: "current.json",
      }
    : {};
  const execution = await execFileAsync(process.execPath, args, {
    cwd: fixture.sandbox,
    env: {
      PATH: process.env.PATH,
      LANG: "C.UTF-8",
      ...poolEnvironment,
      AGENT_RUNTIME_REASONING_EFFORT: "high",
      SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY:
        Buffer.alloc(32, 9).toString("base64"),
    },
    maxBuffer: 1024 * 1024,
  }).then(
    ({ stdout, stderr }) => ({ exitCode: 0, stdout, stderr }),
    (error) => ({
      exitCode: error.code,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    }),
  );
  assert.notEqual(execution.stdout, "", execution.stderr);
  if (beforePoolAuth !== undefined) {
    assert.deepEqual(
      await Promise.all(fixture.authPaths.map((path) => readFile(path, "utf8"))),
      beforePoolAuth,
    );
    assert.deepEqual(
      await readdir(join(fixture.stateRoot, "auth-materializations")),
      [],
    );
  }
  return { ...execution, result: JSON.parse(execution.stdout) };
}

const standardRequest = (runId) => ({
  protocolVersion: 1,
  runId,
  cwd: ".",
  timeoutMs: 10_000,
  task: {
    kind: "structured-prompt",
    systemPrompt: "Return JSON only.",
    prompt: "control",
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

const canaryRequest = (runId, prompt) => ({
  protocolVersion: 1,
  runId,
  cwd: ".",
  timeoutMs: 10_000,
  task: {
    kind: "structured-prompt",
    systemPrompt: "Return JSON only.",
    prompt,
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

function fakeAuth(account, freshness) {
  return {
    auth_mode: "chatgpt",
    last_refresh: freshness === "fresh"
      ? new Date().toISOString()
      : "2000-01-01T00:00:00.000Z",
    tokens: {
      access_token: `fixture-access-${account}`,
      account_id: account,
      id_token: `fixture-id-${account}`,
      refresh_token: `fixture-refresh-${account}`,
      expiry: freshness === "fresh"
        ? "2099-01-01T00:00:00.000Z"
        : "2000-01-02T00:00:00.000Z",
    },
  };
}

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

const nativeStartups = (attempts) => attempts
  .filter((item) => item.event === "startup")
  .map(({ invocationId, account, command }) => ({
    invocationId,
    account,
    command,
  }));

const promptKinds = (attempts) => attempts
  .filter((item) => item.event === "prompt")
  .map((item) => item.promptKind);

function fakeCodexSource(attemptLogPath, invocationId) {
  return `#!/usr/bin/env node
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
const args = process.argv.slice(2);
const command = args[0] ?? "";
const authPath = join(process.env.CODEX_HOME, "auth.json");
const auth = JSON.parse(await readFile(authPath, "utf8"));
const account = auth.tokens.account_id;
const record = (value) => appendFile(
  ${JSON.stringify(attemptLogPath)},
  JSON.stringify({ invocationId: ${JSON.stringify(invocationId)}, account, ...value }) + "\\n",
);
await record({ event: "startup", command });
if (command === "app-server") {
  const input = createInterface({ input: process.stdin });
  for await (const line of input) {
    const request = JSON.parse(line);
    if (request.method === "initialize") send({ id: request.id, result: {} });
    else if (request.method === "account/rateLimits/read") send({ id: request.id, result: { rateLimits: { primary: { usedPercent: 10, windowDurationMins: 300, resetsAt: 4102444800 }, rateLimitReachedType: null } } });
    else if (request.method === "thread/start") { await record({ event: "rpc", method: "thread/start" }); send({ id: request.id, result: { thread: { id: "thread-control" } } }); }
    else if (request.method === "turn/start") { await record({ event: "rpc", method: "turn/start" }); send({ id: request.id, result: { turn: { id: "turn-control" } } }); send({ method: "turn/completed", params: { turn: { id: "turn-control", status: { type: "failed" }, error: { message: "ordinary failure" } } } }); }
  }
} else if (command === "exec") {
  const prompt = await readStdin();
  const refreshBootstrap = prompt.trim() === "Respond with OK only.";
  const scenario = refreshBootstrap
    ? undefined
    : ["control", "valid", "fresh-reconnect", "story-must-not-start"].find(
        (item) => prompt.includes(item),
      ) ?? "story";
  if (refreshBootstrap) {
    auth.last_refresh = new Date().toISOString();
    auth.tokens.access_token += "-rotated";
    auth.tokens.expiry = "2099-01-01T00:00:00.000Z";
    await writeFile(authPath, JSON.stringify(auth), "utf8");
    await record({ event: "prompt", command, promptKind: "refresh-bootstrap", rotatedSession: true });
  } else {
    await record({ event: "prompt", command, promptKind: "story", scenario, hasOutputSchema: args.includes("--output-schema") });
    if (scenario === "fresh-reconnect") {
      process.stderr.write("reconnect required\\n");
      process.exit(1);
    }
    const output = scenario === "control" ? { ok: true } : ${JSON.stringify(validCanaryOutput)};
    process.stdout.write(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(output) } }) + "\\n");
  }
} else {
  process.exit(88);
}
async function readStdin() {
  process.stdin.setEncoding("utf8");
  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  return value;
}
function send(message) { process.stdout.write(JSON.stringify(message) + "\\n"); }
`;
}
