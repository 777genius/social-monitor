import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repository = resolve(import.meta.dirname, "..");
const launch = join(repository, "scripts/start-agent-runtime.mjs");
const settingsModule = join(repository, "apps/agent-runtime/src/agent-runtime-settings.ts");
const tsNodeRegister = requirePath("ts-node/register");

function requirePath(specifier) {
  return import.meta.resolve(specifier).replace(/^file:\/\//, "");
}

const withLauncherFixture = async (callback) => {
  const root = await realpath(await mkdtemp(join(repository, ".agent-runtime-launcher-test-")));
  const home = join(root, "home");
  const workspace = join(root, "workspace");
  const state = join(root, "state");
  const cli = join(root, "launcher");
  const key = join(root, "mimo-key");
  const capture = join(root, "capture.json");
  const preload = join(root, "capture-child.cjs");
  try {
    await Promise.all([mkdir(join(home, ".codex"), { recursive: true }), mkdir(workspace), mkdir(state)]);
    await writeFile(join(home, ".codex/auth.json"), "");
    await writeFile(cli, "#!/usr/bin/env node\n");
    await chmod(cli, 0o755);
    await writeFile(key, "x", { mode: 0o600 });
    await writeFile(preload, `
if (process.argv[1]?.endsWith("/apps/agent-runtime/src/main.ts")) {
  try {
    require(${JSON.stringify(tsNodeRegister)});
    const { resolveAgentRuntimeSettings } = require(${JSON.stringify(settingsModule)});
    const settings = resolveAgentRuntimeSettings(process.env);
    require("node:fs").writeFileSync(process.env.AGENT_RUNTIME_TEST_CAPTURE, JSON.stringify({ settings }));
    process.exit(0);
  } catch (error) {
    require("node:fs").writeFileSync(process.env.AGENT_RUNTIME_TEST_CAPTURE, JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}
`);
    const run = async (entries) => {
      await writeFile(join(root, ".env"), Object.entries(entries).map(([name, value]) => `${name}=${value}`).join("\n"));
      let exitCode = 0;
      try {
        await promisify(execFile)(process.execPath, [launch], {
          cwd: root,
          timeout: 10_000,
          env: {
            PATH: process.env.PATH,
            HOME: home,
            NODE_OPTIONS: `--require=${preload}`,
            TS_NODE_PROJECT: join(repository, "tsconfig.json"),
            AGENT_RUNTIME_TEST_CAPTURE: capture,
          },
        });
      } catch (error) {
        exitCode = error.code;
      }
      return { exitCode, ...JSON.parse(await readFile(capture, "utf8")) };
    };
    await callback({ run, workspace, state, cli, key, home });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

test("dotenv MiMo-only strict settings reach the actual launcher child without a Codex fallback", async () => {
  await withLauncherFixture(async ({ run, workspace, state, cli, key }) => {
    const result = await run({
      AGENT_RUNTIME_STRICT_PRODUCTION_ADMISSION: "1",
      AGENT_RUNTIME_GRPC_BIND: "127.0.0.1:50052",
      AGENT_RUNTIME_SERVICE_TOKEN: "synthetic-test-service-token",
      AGENT_RUNTIME_PROJECT_WORKSPACE_ROOT: workspace,
      AGENT_RUNTIME_STATE_ROOT: state,
      AGENT_RUNTIME_CLI_PATH: cli,
      AGENT_RUNTIME_ALLOWED_MODEL_BACKENDS: "xiaomi-mimo-token-plan",
      AGENT_RUNTIME_ALLOWED_TENANT_ID: "fixture-tenant",
      AGENT_RUNTIME_ALLOWED_WORKSPACE_ID: "fixture-workspace",
      AGENT_RUNTIME_MIMO_API_KEY_FILE: key,
    });
    assert.equal(result.exitCode, 0, result.error);
    assert.equal(result.settings.strictAdmission.workspaceRoot, workspace);
    assert.deepEqual(result.settings.strictAdmission.allowedModelBackends, ["xiaomi-mimo-token-plan"]);
    assert.deepEqual(result.settings.strictAdmission.allowedScope, {
      tenantId: "fixture-tenant", workspaceId: "fixture-workspace",
    });
    assert.equal(result.settings.cli.workspaceRoot, workspace);
    assert.equal(result.settings.cli.mimoApiKeyFile, key);
    assert.equal(result.settings.cli.codexAuthJsonPath, undefined);
  });
});

test("dotenv explicit Codex auth remains forbidden in MiMo-only strict settings", async () => {
  await withLauncherFixture(async ({ run, workspace, state, cli, key, home }) => {
    const result = await run({
      AGENT_RUNTIME_STRICT_PRODUCTION_ADMISSION: "1",
      AGENT_RUNTIME_GRPC_BIND: "127.0.0.1:50052",
      AGENT_RUNTIME_SERVICE_TOKEN: "synthetic-test-service-token",
      AGENT_RUNTIME_PROJECT_WORKSPACE_ROOT: workspace,
      AGENT_RUNTIME_STATE_ROOT: state,
      AGENT_RUNTIME_CLI_PATH: cli,
      AGENT_RUNTIME_ALLOWED_MODEL_BACKENDS: "xiaomi-mimo-token-plan",
      AGENT_RUNTIME_ALLOWED_TENANT_ID: "fixture-tenant",
      AGENT_RUNTIME_ALLOWED_WORKSPACE_ID: "fixture-workspace",
      AGENT_RUNTIME_MIMO_API_KEY_FILE: key,
      AGENT_RUNTIME_CODEX_AUTH_JSON_PATH: join(home, ".codex/auth.json"),
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.error, /AGENT_RUNTIME_CODEX_AUTH_JSON_PATH is forbidden/);
  });
});

test("legacy local Codex settings still receive the default auth path", async () => {
  await withLauncherFixture(async ({ run, home }) => {
    const result = await run({});
    assert.equal(result.exitCode, 0);
    assert.equal(result.settings.cli.codexAuthJsonPath, join(home, ".codex/auth.json"));
  });
});
