import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("ts-node").register({ transpileOnly: true, compilerOptions: { rootDir: resolve(dirname(fileURLToPath(import.meta.url)), "../../..") } });
const { promotionResponseSchema, parseReviews } = require(
  "../../../libs/relevance/adapters/model/source-content-quality-review-wire.ts",
);
const { promotionWireCandidate } = require(
  "../../../libs/relevance/adapters/model/promotion-review-wire.ts",
);
// Native runtime canonicalizes unordered required lists; preserve every constraint.
const nativeAssessmentSchema = JSON.parse(JSON.stringify(promotionResponseSchema,
  (key, value) => key === "required" ? [...value].sort() : value));
const assessmentRequest = {
  candidateId: "sandbox-assessment", providerKey: "reddit",
  title: "Measured compiler diagnostics", deterministic: { flags: [] },
  promotion: { tenantId: "sandbox-tenant", workspaceId: "sandbox-workspace",
    interestId: "sandbox-interest", sourceBindingId: "sandbox-binding",
    sourceItemId: "sandbox-item", trustedIntent: "compiler diagnostics",
    availability: "title_only" },
};
const assessmentOutput = { reviews: [{
  candidateId: assessmentRequest.candidateId,
  bindingId: promotionWireCandidate(assessmentRequest).bindingId,
  decision: "promote", confidence: 0.9, qualityScore: 0.9,
  interestRelevanceScore: 0.9, engagementIntegrityScore: 0.9,
  flags: [], reason: "Captured diagnostic observation",
  evidence: [{ field: "title", start: 0, end: assessmentRequest.title.length,
    quote: assessmentRequest.title }], resolvedSoftFlags: [],
}] };

import { orderCodexAuthAccountsForTask } from "./codex-auth-pool-routing.mjs";
import "./reader-promotion-v2-canary-lane.e2e.test.mjs";
import "./reader-promotion-v2-canary-main30-contract.test.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const runtimeBridgePath = join(
  repositoryRoot,
  "apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs",
);

test(
  "fails over one exact sandbox task through the native Codex auth pool",
  { timeout: 30_000 },
  async () => {
    const fixture = await createFixture();
    try {
      const beforeAuth = await Promise.all(
        fixture.authPaths.map((path) => readFile(path, "utf8")),
      );
      const beforeAuthModes = await Promise.all(
        fixture.authPaths.map(async (path) => (await stat(path)).mode & 0o777),
      );
      const execution = await execFileAsync(
        process.execPath,
        [
          runtimeBridgePath,
          "--provider",
          "codex",
          "--input",
          fixture.requestPath,
          "--format",
          "result-json",
          "--state-root",
          fixture.stateRoot,
          "--codex-binary",
          fixture.codexBinaryPath,
          "--model",
          "gpt-5.6-sol",
          "--timeout-ms",
          "15000",
        ],
        {
          cwd: fixture.sandboxProject,
          env: {
            PATH: process.env.PATH, HOME: process.env.HOME,
            LANG: "C.UTF-8",
            AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT: fixture.poolRoot,
            AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST: "current.json",
            AGENT_RUNTIME_REASONING_EFFORT: "high",
            SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY:
              Buffer.alloc(32, 7).toString("base64"),
          },
          maxBuffer: 1024 * 1024,
        },
      ).then(
        ({ stdout, stderr }) => ({ exitCode: 0, stdout, stderr }),
        (error) => ({
          exitCode: error.code,
          stdout: error.stdout ?? "",
          stderr: error.stderr ?? "",
        }),
      );

      const attempts = (await readFile(fixture.attemptLogPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const result = JSON.parse(execution.stdout);
      assert.equal(
        execution.exitCode,
        0,
        JSON.stringify({ result, attempts, stderr: execution.stderr }),
      );
      assert.equal(result.status, "completed");
      assert.deepEqual(result.structuredOutput, {
        ok: true,
        account: "account-b",
      });
      const rateLimitAttempts = attempts.filter(
        ({ command }) => command === "rate-limits",
      );
      assert.deepEqual(
        rateLimitAttempts.map(({ account, usedPercent }) => ({
          account,
          usedPercent,
        })),
        [
          { account: "account-a", usedPercent: 100 },
          { account: "account-b", usedPercent: 20 },
        ],
      );
      const turnAttempts = attempts.filter(({ command }) => command === "turn");
      assert.deepEqual(
        turnAttempts.map(({ account, command }) => ({ account, command })),
        [{ account: "account-b", command: "turn" }],
      );
      assert.equal(
        attempts.some(
          ({ account, command }) =>
            account === "account-a" &&
            (command === "thread" || command === "turn" || command === "exec"),
        ),
        false,
      );
      for (const turnAttempt of turnAttempts) {
        assert.equal(turnAttempt.model, "gpt-5.6-sol");
        assert.equal(turnAttempt.effort, "high");
        assert.equal(turnAttempt.approvalPolicy, "never");
        assert.deepEqual(turnAttempt.environments, []);
        assert.equal(turnAttempt.materializedAuthChanged, true);
        const threadAttempt = attempts.find(
          ({ account, command, threadId }) =>
            account === turnAttempt.account &&
            command === "thread" &&
            threadId === turnAttempt.threadId,
        );
        assert.ok(
          threadAttempt,
          `missing thread/start for ${turnAttempt.account}`,
        );
        assert.equal(threadAttempt.model, "gpt-5.6-sol");
        assert.equal(threadAttempt.approvalPolicy, "never");
        assert.equal(threadAttempt.sandbox, "read-only");
        assert.equal(threadAttempt.runtimeWorkspaceIsIsolated, true);
        assert.equal(threadAttempt.modelReasoningEffort, "high");
        assert.equal(threadAttempt.sandboxMode, "read-only");
        assert.equal(threadAttempt.webSearch, "disabled");
        assert.deepEqual(threadAttempt.environments, []);
        assert.deepEqual(threadAttempt.dynamicTools, []);
        assert.equal(threadAttempt.experimentalRawEvents, false);
        assert.deepEqual(threadAttempt.features, {
          apps: false,
          hooks: false,
          memories: false,
          multi_agent: false,
          shell_snapshot: false,
          skill_mcp_dependency_install: false,
        });
      }

      const canonicalRequest = JSON.parse(
        await readFile(fixture.requestPath, "utf8"),
      );
      assert.equal(canonicalRequest.task.controls.model, "gpt-5.6-sol");
      assert.equal(canonicalRequest.task.controls.reasoningEffort, "high");
      assert.equal(canonicalRequest.task.controls.responseFormat, "json");
      assert.equal(
        canonicalRequest.task.metadata.runtimeOutput,
        "structured_output",
      );

      const afterAuth = await Promise.all(
        fixture.authPaths.map((path) => readFile(path, "utf8")),
      );
      const afterAuthModes = await Promise.all(
        fixture.authPaths.map(async (path) => (await stat(path)).mode & 0o777),
      );
      assert.deepEqual(afterAuth, beforeAuth);
      assert.deepEqual(beforeAuthModes, [0o400, 0o400]);
      assert.deepEqual(afterAuthModes, beforeAuthModes);
      assert.deepEqual(
        await readdir(join(fixture.stateRoot, "auth-materializations")),
        [],
      );
    } finally {
      await fixture.cleanup();
    }
  },
);

for (const [firstAccount, available] of [["account-b", false], ["account-a", false], ["account-a", true]]) {
  test(`assessment native schema with one attempt starting on ${firstAccount}, available=${available}`, { timeout: 30_000 }, async () => {
    const fixture = await createFixture(available);
    try {
      const request = agentTaskRequest(taskIdStartingWith(["account-a", "account-b"], firstAccount));
      request.context.purpose = "social_monitor.relevance.assess_source_content.v1";
      request.task.outputSchemaName = "social_monitor_source_content_quality_review";
      request.task.controls.outputSchemaName = "social_monitor_source_content_quality_review";
      request.task.controls.outputSchema = promotionResponseSchema;
      await writeFile(fixture.requestPath, JSON.stringify(request));
      const execution = await execFileAsync(process.execPath, [runtimeBridgePath,
        "--provider", "codex", "--input", fixture.requestPath, "--format", "result-json",
        "--state-root", fixture.stateRoot, "--codex-binary", fixture.codexBinaryPath,
        "--model", "gpt-5.6-sol", "--timeout-ms", "15000"], {
        cwd: fixture.sandboxProject, maxBuffer: 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C.UTF-8",
          AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT: fixture.poolRoot,
          AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST: "current.json",
          AGENT_RUNTIME_REASONING_EFFORT: "high",
          SUBSCRIPTION_RUNTIME_LOCAL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") },
      }).then(({ stdout }) => JSON.parse(stdout), (error) => JSON.parse(error.stdout));
      const attempts = (await readFile(fixture.attemptLogPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      assert.equal(attempts.some(({ command }) => command === "exec"), false);
      assert.equal(execution.status, firstAccount === "account-b" || available ? "completed" : "failed");
      if (firstAccount === "account-b" || available) {
        assert.deepEqual(execution.structuredOutput, assessmentOutput);
        assert.deepEqual(attempts.find(({ command }) => command === "turn").outputSchema, nativeAssessmentSchema);
        assert.equal(execution.warnings?.some(({ code }) => code === "codex_app_server_output_schema_not_native") ?? false, false);
        const [review] = parseReviews(JSON.stringify(execution.structuredOutput), [assessmentRequest]);
        assert.equal(review.assessment.binding, assessmentRequest.promotion);
        assert.equal(review.qualityScore, 0.9);
        assert.equal(attempts.filter(({ command }) => command === "turn").length, 1);
      } else {
        assert.equal(attempts.some(({ account }) => account === "account-b"), false);
        assert.equal(attempts.filter(({ command }) => command === "turn").length, 0);
      }
      assert.deepEqual(await readdir(join(fixture.stateRoot, "auth-materializations")), []);
    } finally { await fixture.cleanup(); }
  });
}

for (const invalid of ["missing-name", "wrong-name", "conflicting-name", "missing-schema", "null-schema", "array-schema"]) {
  test(`assessment rejects ${invalid} before native startup`, async () => {
    const fixture = await createFixture();
    try {
      const request = agentTaskRequest("sandbox-invalid-schema");
      request.context.purpose = "social_monitor.relevance.assess_source_content.v1";
      request.task.outputSchemaName = "social_monitor_source_content_quality_review";
      request.task.controls.outputSchema = promotionResponseSchema;
      if (invalid === "missing-name") delete request.task.outputSchemaName;
      if (invalid === "wrong-name") request.task.outputSchemaName = "other";
      if (invalid === "conflicting-name") request.task.controls.outputSchemaName = "other";
      if (invalid === "missing-schema") delete request.task.controls.outputSchema;
      if (invalid === "null-schema") request.task.controls.outputSchema = null;
      if (invalid === "array-schema") request.task.controls.outputSchema = [];
      await writeFile(fixture.requestPath, JSON.stringify(request));
      await assert.rejects(execFileAsync(process.execPath, [runtimeBridgePath,
        "--provider", "codex", "--input", fixture.requestPath], {
        cwd: fixture.sandboxProject,
        env: { PATH: process.env.PATH, LANG: "C.UTF-8" },
      }), (error) => {
        assert.match(error.stderr, /schema|outputSchema/);
        return true;
      });
      await assert.rejects(stat(fixture.attemptLogPath), { code: "ENOENT" });
    } finally { await fixture.cleanup(); }
  });
}

async function createFixture(available = false) {
  const root = await mkdtemp(
    join(tmpdir(), "social-monitor-subscription-runtime-e2e-"),
  );
  const sandboxProject = join(root, "sandbox-project");
  const stateRoot = join(root, "state");
  const poolRoot = join(root, "auth-pool");
  const snapshotId = "sandbox-snapshot-1";
  const snapshotRoot = join(poolRoot, "snapshots", snapshotId);
  const attemptLogPath = join(root, "codex-attempts.ndjson");
  await Promise.all([
    mkdir(sandboxProject, { recursive: true, mode: 0o700 }),
    mkdir(stateRoot, { recursive: true, mode: 0o700 }),
    mkdir(snapshotRoot, { recursive: true, mode: 0o700 }),
  ]);

  const accountIds = ["account-a", "account-b"];
  const authPaths = [];
  const accountRoots = [];
  for (const accountId of accountIds) {
    const accountRoot = join(snapshotRoot, accountId);
    const authPath = join(accountRoot, "auth.json");
    await mkdir(accountRoot, { mode: 0o700 });
    await writeFile(
      authPath,
      `${JSON.stringify(fakeCodexAuth(accountId))}\n`,
      { mode: 0o400 },
    );
    accountRoots.push(accountRoot);
    authPaths.push(authPath);
  }

  const manifestPath = join(poolRoot, "current.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      schemaVersion: 1,
      snapshotId,
      accounts: accountIds.map((id) => ({
        id,
        relativePath: `snapshots/${snapshotId}/${id}/auth.json`,
      })),
    })}\n`,
    { mode: 0o400 },
  );
  const poolDirectories = [
    ...accountRoots,
    snapshotRoot,
    join(poolRoot, "snapshots"),
    poolRoot,
  ];
  await Promise.all(poolDirectories.map((path) => chmod(path, 0o500)));

  const codexBinaryPath = join(root, "fake-codex.mjs");
  await writeFile(
    codexBinaryPath,
    fakeCodexBinarySource(attemptLogPath, stateRoot, available),
    "utf8",
  );
  await chmod(codexBinaryPath, 0o755);

  const requestPath = join(root, "request.json");
  await writeFile(
    requestPath,
    `${JSON.stringify(agentTaskRequest(taskIdStartingWith(accountIds, "account-a")))}\n`,
    "utf8",
  );

  return {
    attemptLogPath,
    authPaths,
    codexBinaryPath,
    poolRoot,
    requestPath,
    sandboxProject,
    stateRoot,
    cleanup: async () => {
      await Promise.all(
        poolDirectories.map((path) => chmod(path, 0o700).catch(() => {})),
      );
      await rm(root, { recursive: true, force: true });
    },
  };
}

function taskIdStartingWith(accountIds, expectedAccountId) {
  for (let index = 0; index < 1000; index += 1) {
    const taskId = `sandbox-auth-pool-e2e-${index}`;
    if (
      orderCodexAuthAccountsForTask(accountIds, taskId)[0] ===
      expectedAccountId
    ) {
      return taskId;
    }
  }
  throw new Error("Unable to select a deterministic first sandbox account");
}

function agentTaskRequest(runId) {
  return {
    protocolVersion: 1,
    runId,
    cwd: ".",
    timeoutMs: 15_000,
    task: {
      kind: "structured-prompt",
      systemPrompt: "Return JSON only.",
      prompt: "Return the sandbox auth-pool result.",
      outputSchemaName: "auth-pool-e2e",
      controls: {
        outputSchema: {
          type: "object",
          required: ["ok", "account"],
          properties: {
            ok: { type: "boolean" },
            account: { type: "string" },
          },
        },
      },
      metadata: {},
    },
    context: {
      application: "social-monitor",
      purpose: "social_monitor.reader_summary.generate.v2",
      correlationId: "sandbox-auth-pool-e2e",
    },
  };
}

function fakeCodexAuth(accountId) {
  return {
    auth_mode: "chatgpt",
    last_refresh: new Date().toISOString(),
    tokens: {
      access_token: `sandbox-access-${accountId}`,
      account_id: accountId,
      id_token: `sandbox-id-${accountId}`,
      refresh_token: `sandbox-refresh-${accountId}`,
      expiry: "2099-01-01T00:00:00.000Z",
    },
  };
}

function fakeCodexBinarySource(attemptLogPath, stateRoot, available) {
  return `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const command = args[0] ?? "";
const materializedAuthPath = join(process.env.CODEX_HOME, "auth.json");
const auth = JSON.parse(await readFile(materializedAuthPath, "utf8"));
const account = auth.tokens.account_id;

if (command === "app-server") {
  const input = createInterface({ input: process.stdin });
  for await (const line of input) {
    const request = JSON.parse(line);
    if (request.method === "initialize") {
      send({ id: request.id, result: {} });
      continue;
    }
    if (request.method === "account/rateLimits/read") {
      const usedPercent = account === "account-a" && !${available} ? 100 : 20;
      await recordAttempt({ account, command: "rate-limits", usedPercent });
      send({
        id: request.id,
        result: {
          rateLimits: {
            primary: {
              usedPercent,
              windowDurationMins: 300,
              resetsAt: Math.floor(Date.now() / 1000) + 3600,
            },
            rateLimitReachedType:
              account === "account-a" && !${available} ? "usage_limit_reached" : null,
          },
        },
      });
      continue;
    }
    if (request.method === "thread/start") {
      const threadId = "thread-" + account;
      await recordAttempt({
        account,
        command: "thread",
        threadId,
        model: request.params.model,
        approvalPolicy: request.params.approvalPolicy,
        sandbox: request.params.sandbox,
        runtimeWorkspaceIsIsolated:
          request.params.cwd.startsWith(${JSON.stringify(`${stateRoot}/task-workspaces/`)}) &&
          request.params.runtimeWorkspaceRoots?.length === 1 &&
          request.params.runtimeWorkspaceRoots[0] === request.params.cwd,
        modelReasoningEffort: request.params.config?.model_reasoning_effort,
        sandboxMode: request.params.config?.sandbox_mode,
        webSearch: request.params.config?.web_search,
        environments: request.params.environments,
        dynamicTools: request.params.dynamicTools,
        experimentalRawEvents: request.params.experimentalRawEvents,
        features: request.params.config?.features,
      });
      send({
        id: request.id,
        result: { thread: { id: threadId } },
      });
      continue;
    }
    if (request.method === "turn/start") {
      const turnId = "turn-" + account;
      const prompt = request.params.input[0].text;
      const materializedAuthChanged = await refreshMaterializedAuth();
      await recordAttempt({
        account,
        command: "turn",
        threadId: request.params.threadId,
        promptSha256: createHash("sha256").update(prompt).digest("hex"),
        model: request.params.model,
        effort: request.params.effort,
        approvalPolicy: request.params.approvalPolicy,
        environments: request.params.environments,
        outputSchema: request.params.outputSchema,
        materializedAuthChanged,
      });
      send({ id: request.id, result: { turn: { id: turnId } } });
      if (account === "account-a" && !${available}) {
        send({
          method: "turn/completed",
          params: {
            turn: {
              id: turnId,
              status: { type: "failed" },
              error: { message: "You've hit your usage limit" },
            },
          },
        });
      } else {
        send({
          method: "item/completed",
          params: {
            turnId,
            item: {
              type: "agentMessage",
              text: JSON.stringify(request.params.outputSchema?.properties?.reviews ? ${JSON.stringify(assessmentOutput)} : { ok: true, account }),
            },
          },
        });
        send({
          method: "turn/completed",
          params: {
            turn: { id: turnId, status: { type: "completed" } },
          },
        });
      }
      continue;
    }
    send({
      id: request.id,
      error: { code: -32601, message: "unsupported sandbox method" },
    });
  }
} else if (command === "exec") {
  const prompt = await readStdin();
  await recordAttempt({
    account,
    command: "exec",
    promptSha256: createHash("sha256").update(prompt).digest("hex"),
  });
  if (account === "account-a") {
    process.stderr.write("You've hit your usage limit\\n");
    process.exit(1);
  }
  process.stdout.write(
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "agent_message",
        text: JSON.stringify({ ok: true, account }),
      },
    }) + "\\n",
  );
} else {
  process.stderr.write("sandbox fake Codex received an unsupported command\\n");
  process.exit(87);
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\\n");
}

async function readStdin() {
  process.stdin.setEncoding("utf8");
  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  return value;
}

async function refreshMaterializedAuth() {
  const before = await readFile(materializedAuthPath, "utf8");
  const refreshed = {
    ...auth,
    last_refresh: new Date().toISOString(),
    tokens: {
      ...auth.tokens,
      access_token: "sandbox-refreshed-access-" + account,
    },
  };
  const after = JSON.stringify(refreshed) + "\\n";
  await writeFile(materializedAuthPath, after, "utf8");
  return before !== after;
}

async function recordAttempt(attempt) {
  await appendFile(
    ${JSON.stringify(attemptLogPath)},
    JSON.stringify(attempt) + "\\n",
    "utf8",
  );
}
`;
}
