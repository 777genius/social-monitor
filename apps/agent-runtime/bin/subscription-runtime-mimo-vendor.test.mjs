import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const version = "0.1.0-main.40-sm-mimo.2";
const archivePath = `vendor/vioxen-subscription-runtime-${version}.tgz`;

test("the scoped MiMo runtime is pinned and exposes the app-server-goal backend", async () => {
  const [manifest, oldManifest, lock, archive] = await Promise.all([
    readFile("node_modules/@vioxen/subscription-runtime-mimo/package.json", "utf8").then(JSON.parse),
    readFile("node_modules/@vioxen/subscription-runtime/package.json", "utf8").then(JSON.parse),
    readFile("package-lock.json", "utf8").then(JSON.parse),
    readFile(archivePath),
  ]);
  assert.equal(manifest.version, version);
  assert.equal(oldManifest.version, "0.1.0-main.42-sm.3");
  const [oldWorkerContract, mimoWorkerContract] = await Promise.all([
    readFile("node_modules/@vioxen/subscription-runtime/dist/worker-codex/file-backend-codex-worker.d.ts", "utf8"),
    readFile("node_modules/@vioxen/subscription-runtime-mimo/dist/worker-codex/file-backend-codex-worker.d.ts", "utf8"),
  ]);
  assert.equal(mimoWorkerContract, oldWorkerContract);
  assert.equal(lock.packages[""].dependencies["@vioxen/subscription-runtime-mimo"],
    `file:${archivePath}`);
  assert.equal(lock.packages["node_modules/@vioxen/subscription-runtime-mimo"].integrity,
    `sha512-${createHash("sha512").update(archive).digest("base64")}`);

  const { CodexModelBackend } = await import("@vioxen/subscription-runtime-mimo/provider-codex");
  const { FileBackendCodexWorker, createOneShotExecutor } = await import(
    "@vioxen/subscription-runtime-mimo/worker-codex"
  );
  assert.equal(CodexModelBackend.XiaomiMimoTokenPlan, "xiaomi-mimo-token-plan");
  assert.equal(typeof createOneShotExecutor, "function");
  const options = {
    providerInstanceId: "synthetic-mimo-summary",
    stateRootDir: "/tmp/synthetic-mimo-summary",
    workspacePath: "/tmp/synthetic-mimo-summary",
    codexBinaryPath: "/synthetic/not-executed",
    encryptionKey: Buffer.alloc(32, 7).toString("base64"),
    modelBackend: CodexModelBackend.XiaomiMimoTokenPlan,
    model: "mimo-v2.6-pro",
    sourceEnv: { MIMO_TOKEN_PLAN_API_KEY: "synthetic-test-key" },
    boundedWorkspaceTools: { allowedTools: [], denyProjectInstructions: true },
    outputSchemas: {
      social_monitor_reader_summary_artifact: {
        type: "object", properties: { summary: { type: "string" } },
      },
    },
  };
  assert.throws(() => new FileBackendCodexWorker({
    ...options, executionEngine: "app-server",
  }), /mimo_requires_app_server_goal_engine/u);
  const worker = new FileBackendCodexWorker({
    ...options, executionEngine: "app-server-goal",
  });
  assert.equal(worker.runtime.executionPlan.kind, "no-session");
  assert.equal(worker.runtime.executionPlan.writeback, "never");
  assert.deepEqual(
    worker.agentDriver.outputSchemaRequest("social_monitor_reader_summary_artifact"),
    {
      name: "social_monitor_reader_summary_artifact",
      schema: options.outputSchemas.social_monitor_reader_summary_artifact,
    },
  );
  const config = worker.agentDriver.options.mimoConfigToml;
  assert.match(config, /\[model_providers\.mimo\]/u);
  assert.match(config, /enabled_tools = \[\]/u);
  assert.match(config, /shell_tool = false/u);
  assert.match(config, /env_key = "MIMO_TOKEN_PLAN_API_KEY"/u);
  assert.equal(config.includes(options.sourceEnv.MIMO_TOKEN_PLAN_API_KEY), false);
});
