import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const artifactPath = join(
  process.cwd(),
  "vendor/vioxen-subscription-runtime-0.1.0-main.30.tgz",
);
const runtimeDependencies = [
  "@anthropic-ai/claude-agent-sdk",
  "@modelcontextprotocol/sdk",
  "@types/node",
  "ajv",
  "libsodium-wrappers",
  "zod",
];

test("vendored main.30 binds the final exact Codex usage to one clean turn", async () => {
  await withVendoredRuntime(async (packageRoot) => {
    const { CodexAppServerExecutionEngine } = await importFromPackage(
      packageRoot,
      "dist/provider-codex/codex-app-server-execution-engine.js",
    );
    const processFactory = fakeAppServerProcessFactory([
      tokenUsage("other-thread", "foreign-turn", usage(900, 90)),
      tokenUsage("thread-1", "stale-turn", usage(800, 80)),
      tokenUsage("thread-1", "turn-1", usage(10, 4)),
      rawResponseUsage("thread-1", "turn-1", usage(300, 30)),
      itemCompleted("thread-1", "turn-1", "exact output"),
      turnCompleted("turn-1", usage(12, 5)),
    ]);
    const engine = new CodexAppServerExecutionEngine({
      codexBinaryPath: "codex",
      processFactory,
      cleanThreadPrewarm: false,
    });

    try {
      const result = await engine.run(engineInput());
      assert.equal(result.outputText, "exact output");
      assert.deepEqual(result.usage, {
        inputTokens: 12,
        outputTokens: 5,
        totalTokens: 17,
      });
    } finally {
      await engine.dispose();
    }
  });
});

test("vendored main.30 fails closed for malformed or absent exact turn usage", async () => {
  await withVendoredRuntime(async (packageRoot) => {
    const { CodexAppServerExecutionEngine } = await importFromPackage(
      packageRoot,
      "dist/provider-codex/codex-app-server-execution-engine.js",
    );
    for (const notifications of [
      [],
      [tokenUsage("thread-1", "turn-1", usage(4, 2, 99))],
      [tokenUsage("thread-1", "turn-1", usage(-1, 2, 1))],
      [
        tokenUsage("thread-1", "turn-1", usage(4, 2)),
        tokenUsage("thread-1", "turn-1", {
          inputTokens: Number.MAX_SAFE_INTEGER + 1,
          outputTokens: 0,
          totalTokens: Number.MAX_SAFE_INTEGER + 1,
        }),
      ],
    ]) {
      const engine = new CodexAppServerExecutionEngine({
        codexBinaryPath: "codex",
        processFactory: fakeAppServerProcessFactory([
          ...notifications,
          itemCompleted("thread-1", "turn-1", "output"),
        ]),
        cleanThreadPrewarm: false,
      });
      try {
        const result = await engine.run(engineInput());
        assert.equal(result.usage, undefined);
      } finally {
        await engine.dispose();
      }
    }
  });
});

test("vendored main.30 carries engine usage through driver and worker telemetry", async () => {
  await withVendoredRuntime(async (packageRoot) => {
    const [{ CodexJsonAgentDriver }, { FileBackendCodexManagedRunCoordinator }] =
      await Promise.all([
        importFromPackage(
          packageRoot,
          "dist/provider-codex/codex-json-agent-driver.js",
        ),
        importFromPackage(
          packageRoot,
          "dist/worker-codex/file-backend-codex-managed-run-recovery.js",
        ),
      ]);
    const exactUsage = usage(20, 7);
    const driver = new CodexJsonAgentDriver({
      engine: {
        capabilities: {
          supportsStructuredOutput: true,
          supportsJsonEvents: true,
          supportsThreadResume: false,
          requiresSchemaFile: false,
        },
        run: async () => ({
          outputText: "output",
          usage: exactUsage,
          warnings: [],
        }),
      },
      sessionMaterializer: {
        materialize: async () => ({
          home: "/tmp/runtime-home",
          codexHome: "/tmp/runtime-codex-home",
          env: {},
          snapshotSession: async () => null,
          release: async () => {},
        }),
      },
    });
    const providerResult = await driver.runTask({
      session: { kind: "codex-auth-json", data: {} },
      task: {
        kind: "structured-prompt",
        prompt: "prompt",
        systemPrompt: "system",
      },
      workspace: { path: "/tmp/runtime-workspace" },
      runner: {},
      redactor: {
        registerSecret() {},
        redact: (value) => value,
        assertNoKnownSecret() {},
      },
      abortSignal: new AbortController().signal,
    });
    assert.equal(providerResult.status, "completed");
    assert.deepEqual(providerResult.telemetry?.usage, exactUsage);
    assert.equal(Number.isSafeInteger(providerResult.telemetry?.durationMs), true);

    const coordinator = new FileBackendCodexManagedRunCoordinator({
      providerInstanceId: "test-provider",
      workerId: "test-worker",
      agentDriver: null,
      recordSuccessfulRun() {},
    });
    const workerResult = await coordinator.taskResultToOutput(providerResult);
    assert.deepEqual(workerResult.usage, providerResult.telemetry?.usage);
  });
});

test("vendored artifact manifest and declarations identify main.30 usage telemetry", async () => {
  await withVendoredRuntime(async (packageRoot) => {
    const manifest = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    );
    assert.equal(manifest.version, "0.1.0-main.30");
    assert.equal(manifest.license, "UNLICENSED");
    assert.deepEqual(manifest.dependencies, {
      "@anthropic-ai/claude-agent-sdk": "0.3.237",
      "@vioxen/agent-account-observability":
        "file:packages/agent-account-observability",
      "@modelcontextprotocol/sdk": "^1.30.0",
      "@types/node": "^22.20.0",
      ajv: "8.20.0",
      "libsodium-wrappers": "^0.8.4",
      zod: "^4.4.3",
    });
    const declarations = await readFile(
      join(
        packageRoot,
        "dist/provider-codex/codex-json-execution-engine.d.ts",
      ),
      "utf8",
    );
    assert.match(declarations, /readonly usage\?: AgentUsage;/u);

    const { providerTaskResultToAgentTaskResult } = await importFromPackage(
      packageRoot,
      "dist/agent-task/codec.js",
    );
    const exact = providerTaskResultToAgentTaskResult({
      status: "completed",
      outputText: "output",
      telemetry: { usage: usage(1, 1) },
      warnings: [],
    });
    assert.deepEqual(exact.telemetry?.usage, usage(1, 1));
    assert.throws(
      () => providerTaskResultToAgentTaskResult({
        status: "completed",
        outputText: "output",
        telemetry: {
          usage: usage(0, 0),
        },
        warnings: [],
      }),
      /positive integer/u,
    );
  });
});

async function withVendoredRuntime(run) {
  const tempRoot = await mkdtemp(
    join(tmpdir(), "subscription-runtime-main30-test-"),
  );
  try {
    const extracted = spawnSync(
      "tar",
      ["-xzf", artifactPath, "-C", tempRoot],
      { encoding: "utf8" },
    );
    assert.equal(extracted.status, 0, extracted.stderr);
    const packageRoot = join(tempRoot, "package");
    await linkLockedRuntimeDependencies(packageRoot);
    await run(packageRoot);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function linkLockedRuntimeDependencies(packageRoot) {
  for (const dependency of runtimeDependencies) {
    const dependencyRoot = await resolveLockedRuntimeDependency(dependency);
    const target = join(packageRoot, "node_modules", dependency);
    await mkdir(dirname(target), { recursive: true });
    await symlink(dependencyRoot, target, "dir");
  }
}

async function resolveLockedRuntimeDependency(dependency) {
  const candidates = [
    join(
      process.cwd(),
      "node_modules/@vioxen/subscription-runtime/node_modules",
      dependency,
    ),
    join(process.cwd(), "node_modules", dependency),
  ];
  for (const candidate of candidates) {
    try {
      return await realpath(candidate);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  throw new Error(`Locked runtime dependency is missing: ${dependency}`);
}

const importFromPackage = (packageRoot, relativePath) =>
  import(pathToFileURL(join(packageRoot, relativePath)).href);

const engineInput = () => ({
  prompt: "prompt",
  session: {
    home: "/tmp/runtime-home",
    codexHome: "/tmp/runtime-codex-home",
    env: {},
    release: async () => {},
  },
  workspacePath: "/tmp/runtime-workspace",
  runner: {},
  redactor: {
    redact: (value) => value,
    assertNoKnownSecret() {},
  },
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  abortSignal: new AbortController().signal,
});

function fakeAppServerProcessFactory(turnNotifications) {
  return () => {
    const child = new EventEmitter();
    child.stdout = stream();
    child.stderr = stream();
    child.stdin = {
      write(chunk) {
        const request = JSON.parse(String(chunk));
        globalThis.queueMicrotask(() =>
          respond(child, request, turnNotifications));
        return true;
      },
      end() {},
    };
    child.kill = () => {
      globalThis.queueMicrotask(() => child.emit("exit", 0, null));
      return true;
    };
    return child;
  };
}

function respond(child, request, turnNotifications) {
  if (request.method === "initialize") {
    emit(child, { id: request.id, result: {} });
    return;
  }
  if (request.method === "thread/start") {
    emit(child, { id: request.id, result: { thread: { id: "thread-1" } } });
    return;
  }
  if (request.method === "turn/start") {
    const hasTurnCompleted = turnNotifications.some(
      (message) => message.method === "turn/completed",
    );
    emit(
      child,
      { id: request.id, result: { turn: { id: "turn-1" } } },
      ...turnNotifications,
      { method: "turn/started", params: {
        threadId: "thread-1", turn: { id: "turn-1" },
      } },
      ...(hasTurnCompleted
        ? []
        : [{ method: "turn/completed", params: {
            threadId: "thread-1",
            turn: { id: "turn-1", status: { type: "completed" } },
          } }]),
    );
    return;
  }
  throw new Error(`unexpected app-server request: ${request.method}`);
}

function emit(child, ...messages) {
  child.stdout.emit(
    "data",
    `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`,
  );
}

function stream() {
  const value = new EventEmitter();
  value.setEncoding = () => value;
  return value;
}

const usage = (inputTokens, outputTokens, totalTokens = inputTokens + outputTokens) => ({
  inputTokens,
  outputTokens,
  totalTokens,
});

const tokenUsage = (threadId, turnId, last) => ({
  method: "thread/tokenUsage/updated",
  params: {
    threadId,
    turnId,
    tokenUsage: {
      last,
      total: usage(last.inputTokens + 100, last.outputTokens + 50),
      modelContextWindow: 200_000,
    },
  },
});

const rawResponseUsage = (threadId, turnId, responseUsage) => ({
  method: "rawResponse/completed",
  params: { threadId, turnId, responseId: "response-1", usage: responseUsage },
});

const itemCompleted = (threadId, turnId, text) => ({
  method: "item/completed",
  params: { threadId, turnId, item: { type: "agentMessage", text } },
});

const turnCompleted = (turnId, turnUsage) => ({
  method: "turn/completed",
  params: {
    threadId: "thread-1",
    turn: {
      id: turnId,
      status: { type: "completed" },
      usage: turnUsage,
    },
  },
});
