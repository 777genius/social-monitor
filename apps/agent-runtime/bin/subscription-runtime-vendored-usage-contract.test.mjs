import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const artifactPath = join(
  process.cwd(),
  "vendor/vioxen-subscription-runtime-0.1.0-main.2-sm.2.tgz",
);

test("vendored sm.2 binds the final exact Codex usage to one clean turn", async () => {
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
      tokenUsage("thread-1", "turn-1", usage(12, 5)),
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

test("vendored sm.2 fails closed for malformed or absent exact turn usage", async () => {
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

test("vendored sm.2 carries engine usage through driver and worker telemetry", async () => {
  await withVendoredRuntime(async (packageRoot) => {
    const [{ CodexJsonAgentDriver }, { FileBackendCodexWorker }] =
      await Promise.all([
        importFromPackage(
          packageRoot,
          "dist/provider-codex/codex-json-agent-driver.js",
        ),
        importFromPackage(
          packageRoot,
          "dist/worker-codex/file-backend-codex-worker.js",
        ),
      ]);
    const exactUsage = usage(20, 7);
    const driver = new CodexJsonAgentDriver({
      engine: {
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

    const worker = Object.create(FileBackendCodexWorker.prototype);
    worker.recordSuccessfulRun = () => {};
    const workerResult = worker.taskResultToOutput(providerResult);
    assert.deepEqual(workerResult.telemetry, providerResult.telemetry);
  });
});

test("vendored artifact manifest and declarations identify sm.2 usage telemetry", async () => {
  await withVendoredRuntime(async (packageRoot) => {
    const manifest = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    );
    assert.equal(manifest.version, "0.1.0-main.2-sm.2");
    assert.equal(manifest.license, "UNLICENSED");
    assert.deepEqual(manifest.dependencies, {
      "libsodium-wrappers": "^0.8.4",
    });
    const declarations = await readFile(
      join(
        packageRoot,
        "dist/provider-codex/codex-json-execution-engine.d.ts",
      ),
      "utf8",
    );
    assert.match(declarations, /readonly usage\?: \{/u);

    const { providerTaskResultToAgentTaskResult } = await importFromPackage(
      packageRoot,
      "dist/agent-task/codec.js",
    );
    const zero = providerTaskResultToAgentTaskResult({
      status: "completed",
      outputText: "output",
      telemetry: { usage: usage(0, 0) },
      warnings: [],
    });
    assert.deepEqual(zero.telemetry?.usage, usage(0, 0));
    assert.throws(
      () => providerTaskResultToAgentTaskResult({
        status: "completed",
        outputText: "output",
        telemetry: {
          usage: {
            inputTokens: Number.MAX_SAFE_INTEGER + 1,
            outputTokens: 0,
            totalTokens: Number.MAX_SAFE_INTEGER + 1,
          },
        },
        warnings: [],
      }),
      /non-negative safe integer/u,
    );
  });
});

async function withVendoredRuntime(run) {
  const tempRoot = await mkdtemp(join(tmpdir(), "subscription-runtime-sm2-test-"));
  try {
    const extracted = spawnSync(
      "tar",
      ["-xzf", artifactPath, "-C", tempRoot],
      { encoding: "utf8" },
    );
    assert.equal(extracted.status, 0, extracted.stderr);
    await run(join(tempRoot, "package"));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
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
    emit(
      child,
      { id: request.id, result: { turn: { id: "turn-1" } } },
      ...turnNotifications,
      { method: "turn/started", params: {
        threadId: "thread-1", turn: { id: "turn-1" },
      } },
      { method: "turn/completed", params: {
        threadId: "thread-1",
        turn: { id: "turn-1", status: { type: "completed" } },
      } },
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
