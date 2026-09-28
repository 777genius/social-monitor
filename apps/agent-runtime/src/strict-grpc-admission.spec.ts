import { Metadata, status } from "@grpc/grpc-js";
import { chmod, link, mkdir, mkdtemp, realpath, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentRuntimeProvider,
  type AgentRuntimeTaskRequest,
} from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";

import { createAgentRuntimeGrpcService } from "./agent-runtime-grpc-service";
import type { AgentRuntimeExecutorPort } from "./agent-runtime-executor.port";
import { resolveAgentRuntimeSettings } from "./agent-runtime-settings";
import { admitStrictCwd } from "./strict-grpc-admission";

describe("opt-in strict gRPC admission", () => {
  let fixtureRoot: string;
  let env: NodeJS.ProcessEnv;
  let workspace: string;

  beforeEach(async () => {
    fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), "agent-runtime-strict-fixture-")));
    workspace = join(fixtureRoot, "project");
    const state = join(fixtureRoot, "state");
    const pool = join(fixtureRoot, "pool");
    await mkdir(join(workspace, "nested"), { recursive: true });
    await mkdir(state);
    await mkdir(join(pool, "snapshots", "fixture"), { recursive: true });
    await writeFile(join(pool, "snapshots", "fixture", "auth.json"), "{}\n");
    await writeFile(join(pool, "manifest.json"), JSON.stringify({
      schemaVersion: 1,
      snapshotId: "fixture",
      accounts: [{ id: "fixture", relativePath: "snapshots/fixture/auth.json" }],
    }));
    const cli = join(fixtureRoot, "cli.mjs");
    await writeFile(cli, "#!/usr/bin/env node\n");
    await chmod(cli, 0o755);
    env = {
      AGENT_RUNTIME_STRICT_PRODUCTION_ADMISSION: "1",
      AGENT_RUNTIME_GRPC_BIND: "127.0.0.1:50052",
      AGENT_RUNTIME_SERVICE_TOKEN: "x",
      AGENT_RUNTIME_PROJECT_WORKSPACE_ROOT: workspace,
      AGENT_RUNTIME_STATE_ROOT: state,
      AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT: pool,
      AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST: join(pool, "manifest.json"),
      AGENT_RUNTIME_CLI_PATH: cli,
    };
  });

  afterEach(async () => { await rm(fixtureRoot, { recursive: true, force: true }); });

  it("keeps legacy defaults and opt-in strict settings separate", () => {
    expect(resolveAgentRuntimeSettings({}).strictAdmission).toBeUndefined();
    expect(resolveAgentRuntimeSettings({}).bindAddress).toBe("0.0.0.0:50052");
    expect(resolveAgentRuntimeSettings(env).strictAdmission?.workspaceRoot).toBe(workspace);
    expect(resolveAgentRuntimeSettings(env).cli.allowedModelBackends).toEqual([
      "openai-chatgpt", "xiaomi-mimo-token-plan",
    ]);
  });

  it("admits a MiMo-only strict service without a Codex pool and rejects stray Codex settings", async () => {
    const trustedRoot = await realpath(await mkdtemp(join(process.cwd(), ".mimo-strict-fixture-")));
    try {
      const project = join(trustedRoot, "project");
      const state = join(trustedRoot, "state");
      const key = join(trustedRoot, "mimo-key");
      await mkdir(project);
      await mkdir(state);
      await writeFile(key, "synthetic-key");
      await chmod(key, 0o600);
      const { AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT: _pool, AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST: _manifest, ...withoutPool } = env;
      const mimoEnv = {
        ...withoutPool,
        AGENT_RUNTIME_PROJECT_WORKSPACE_ROOT: project,
        AGENT_RUNTIME_STATE_ROOT: state,
        AGENT_RUNTIME_MIMO_API_KEY_FILE: key,
        AGENT_RUNTIME_ALLOWED_MODEL_BACKENDS: "xiaomi-mimo-token-plan",
        AGENT_RUNTIME_ALLOWED_TENANT_ID: "fixture-tenant",
        AGENT_RUNTIME_ALLOWED_WORKSPACE_ID: "fixture-workspace",
      };
      const settings = resolveAgentRuntimeSettings(mimoEnv);
      expect(settings.strictAdmission?.allowedModelBackends).toEqual(["xiaomi-mimo-token-plan"]);
      expect(settings.strictAdmission).toMatchObject({ allowedScope: { tenantId: "fixture-tenant", workspaceId: "fixture-workspace" } });
      const execute = jest.fn(async () => ({ status: "completed" as const, warnings: [] }));
      const service = createAgentRuntimeGrpcService({
        execute,
        checkHealth: async () => ({ healthy: true, runtimeEngine: "fixture", runtimeVersion: "1", warnings: [] }),
      }, { serviceToken: "x", strictAdmission: settings.strictAdmission });
      const metadata = new Metadata();
      metadata.set("authorization", "Bearer x");
      const run = (tenantId: string, workspaceId: string) => new Promise<status | undefined>((resolve) => {
        service.runAgentTask({ request: { ...request(project), tenantId, workspaceId }, metadata } as Parameters<typeof service.runAgentTask>[0],
          (error) => resolve(error?.code));
      });
      expect(await run("other-tenant", "fixture-workspace")).toBe(status.UNAUTHENTICATED);
      expect(await run("fixture-tenant", "other-workspace")).toBe(status.UNAUTHENTICATED);
      expect(execute).not.toHaveBeenCalled();
      expect(await run("fixture-tenant", "fixture-workspace")).toBeUndefined();
      expect(execute).toHaveBeenCalledTimes(1);
      const unboundService = createAgentRuntimeGrpcService({
        execute,
        checkHealth: async () => ({ healthy: true, runtimeEngine: "fixture", runtimeVersion: "1", warnings: [] }),
      }, { serviceToken: "x", strictAdmission: { ...settings.strictAdmission!, allowedScope: undefined } });
      expect(await new Promise<status | undefined>((resolve) => {
        unboundService.runAgentTask({ request: request(project), metadata } as Parameters<typeof service.runAgentTask>[0],
          (error) => resolve(error?.code));
      })).toBe(status.UNAUTHENTICATED);
      expect(execute).toHaveBeenCalledTimes(1);
      for (const override of [
        { AGENT_RUNTIME_ALLOWED_TENANT_ID: undefined },
        { AGENT_RUNTIME_ALLOWED_WORKSPACE_ID: undefined },
        { AGENT_RUNTIME_ALLOWED_TENANT_ID: "" },
        { AGENT_RUNTIME_ALLOWED_WORKSPACE_ID: "*" },
        { AGENT_RUNTIME_ALLOWED_TENANT_ID: " fixture-tenant" },
        { AGENT_RUNTIME_ALLOWED_WORKSPACE_ID: "fixture-workspace " },
        { AGENT_RUNTIME_ALLOWED_WORKSPACE_ID: "fixture-workspace\n" },
      ]) {
        expect(() => resolveAgentRuntimeSettings({ ...mimoEnv, ...override })).toThrow();
      }
      expect(settings.cli.mimoApiKeyFile).toBe(key);
      expect(settings.cli.ephemeral).toBe(false);
      expect(() => resolveAgentRuntimeSettings({ ...mimoEnv, AGENT_RUNTIME_MIMO_API_KEY_FILE: undefined })).toThrow();
      for (const name of ["AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT", "AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST",
        "AGENT_RUNTIME_CODEX_AUTH_JSON_PATH", "CODEX_AUTH_JSON_PATH"] as const) {
        expect(() => resolveAgentRuntimeSettings({ ...mimoEnv, [name]: "" })).toThrow(name);
      }
      for (const [label, override] of [
        ["relative", { AGENT_RUNTIME_MIMO_API_KEY_FILE: "mimo-key" }],
        ["traversal", { AGENT_RUNTIME_MIMO_API_KEY_FILE: `${trustedRoot}/project/../mimo-key` }],
        ["workspace", { AGENT_RUNTIME_MIMO_API_KEY_FILE: join(project, "inside-key") }],
      ] as const) {
        if (label === "workspace") {
          await writeFile(join(project, "inside-key"), "synthetic");
          await chmod(join(project, "inside-key"), 0o600);
        }
        expect(() => resolveAgentRuntimeSettings({ ...mimoEnv, ...override })).toThrow();
      }
      const alias = join(trustedRoot, "key-alias");
      await symlink(key, alias);
      expect(() => resolveAgentRuntimeSettings({ ...mimoEnv, AGENT_RUNTIME_MIMO_API_KEY_FILE: alias })).toThrow();
      const stateKey = join(state, "inside-key");
      await writeFile(stateKey, "synthetic");
      await chmod(stateKey, 0o600);
      expect(() => resolveAgentRuntimeSettings({ ...mimoEnv, AGENT_RUNTIME_MIMO_API_KEY_FILE: stateKey })).toThrow();
      const parentAlias = join(trustedRoot, "parent-alias");
      await symlink(trustedRoot, parentAlias);
      expect(() => resolveAgentRuntimeSettings({ ...mimoEnv, AGENT_RUNTIME_MIMO_API_KEY_FILE: join(parentAlias, "mimo-key") })).toThrow();
      await chmod(key, 0o640);
      expect(() => resolveAgentRuntimeSettings(mimoEnv)).toThrow("owner-only");
      await chmod(key, 0o000);
      expect(() => resolveAgentRuntimeSettings(mimoEnv)).toThrow("owner-only");
      await chmod(key, 0o600);
      const hardlink = join(trustedRoot, "key-hardlink");
      await link(key, hardlink);
      expect(() => resolveAgentRuntimeSettings(mimoEnv)).toThrow("owner-only");
      await rm(hardlink);
      await truncate(key, 0);
      expect(() => resolveAgentRuntimeSettings(mimoEnv)).toThrow("owner-only");
      await truncate(key, 4097);
      expect(() => resolveAgentRuntimeSettings(mimoEnv)).toThrow("owner-only");
      await truncate(key, 1);
      await chmod(trustedRoot, 0o770);
      expect(() => resolveAgentRuntimeSettings(mimoEnv)).toThrow("trusted parent");
    } finally {
      await rm(trustedRoot, { recursive: true, force: true });
    }
  });

  it("rejects unknown or duplicate backend selections and a selection outside strict mode", () => {
    for (const value of ["", "codex", "xiaomi-mimo-token-plan,openai-chatgpt,legacy",
      "xiaomi-mimo-token-plan,xiaomi-mimo-token-plan", " xiaomi-mimo-token-plan"]) {
      expect(() => resolveAgentRuntimeSettings({ ...env, AGENT_RUNTIME_ALLOWED_MODEL_BACKENDS: value })).toThrow();
    }
    expect(() => resolveAgentRuntimeSettings({ AGENT_RUNTIME_ALLOWED_MODEL_BACKENDS: "xiaomi-mimo-token-plan" })).toThrow("requires strict");
  });

  it("keeps tokenless default Health compatible", async () => {
    const executor: AgentRuntimeExecutorPort = {
      execute: async () => ({ status: "completed", warnings: [] }),
      checkHealth: async () => ({ healthy: true, runtimeEngine: "fixture", runtimeVersion: "1", warnings: [] }),
    };
    const service = createAgentRuntimeGrpcService(executor, {});
    const code = await new Promise<status | undefined>((resolve) => {
      service.checkHealth({ request: {}, metadata: new Metadata() } as Parameters<typeof service.checkHealth>[0],
        (error) => resolve(error?.code));
    });
    expect(code).toBeUndefined();
  });

  it("binds configured strict task scope before executor invocation and keeps Health token authenticated", async () => {
    const calls: string[] = [];
    const executor: AgentRuntimeExecutorPort = {
      execute: async () => { calls.push("task"); return { status: "completed", warnings: [] }; },
      checkHealth: async () => { calls.push("health"); return { healthy: true, runtimeEngine: "fixture", runtimeVersion: "1", warnings: [] }; },
    };
    const scopedEnv = {
      ...env,
      AGENT_RUNTIME_ALLOWED_TENANT_ID: "fixture-tenant",
      AGENT_RUNTIME_ALLOWED_WORKSPACE_ID: "fixture-workspace",
    };
    const service = createAgentRuntimeGrpcService(executor, {
      serviceToken: "x",
      strictAdmission: resolveAgentRuntimeSettings(scopedEnv).strictAdmission,
    });
    const metadata = new Metadata();
    metadata.set("authorization", "Bearer x");
    const run = (tenantId: string, workspaceId: string) => new Promise<{ code?: status; message?: string }>((resolve) => {
      service.runAgentTask({ request: { ...request(workspace), tenantId, workspaceId }, metadata } as Parameters<typeof service.runAgentTask>[0],
        (error) => resolve({ code: error?.code, message: error ? (error as Error).message : undefined }));
    });
    for (const [tenantId, workspaceId] of [
      ["other-tenant", "fixture-workspace"],
      ["fixture-tenant", "other-workspace"],
      [" fixture-tenant", "fixture-workspace"],
      ["fixture-tenant", "fixture-workspace "],
      ["fixture-tenant", "fixture-workspace\n"],
      ["", "fixture-workspace"],
    ] as const) {
      expect(await run(tenantId, workspaceId)).toEqual({ code: status.UNAUTHENTICATED, message: "Unauthorized" });
    }
    expect(calls).toEqual([]);
    expect(await run("fixture-tenant", "fixture-workspace")).toEqual({ code: undefined, message: undefined });
    expect(calls).toEqual(["task"]);
    await new Promise<void>((resolve) => {
      service.checkHealth({ request: {}, metadata } as Parameters<typeof service.checkHealth>[0],
        (error) => { expect(error).toBeNull(); resolve(); });
    });
    expect(calls).toEqual(["task", "health"]);
    expect(() => resolveAgentRuntimeSettings({ ...env, AGENT_RUNTIME_ALLOWED_TENANT_ID: "fixture-tenant" })).toThrow();
    expect(() => resolveAgentRuntimeSettings({ ...env, AGENT_RUNTIME_ALLOWED_WORKSPACE_ID: "fixture-workspace" })).toThrow();
  });

  it.each([
    ["missing token", { AGENT_RUNTIME_SERVICE_TOKEN: undefined }],
    ["wildcard bind", { AGENT_RUNTIME_GRPC_BIND: "0.0.0.0:50052" }],
    ["IPv6 wildcard", { AGENT_RUNTIME_GRPC_BIND: "[::]:50052" }],
    ["short IPv6 prefix outside ULA", { AGENT_RUNTIME_GRPC_BIND: "[fc::1]:50052" }],
    ["public bind", { AGENT_RUNTIME_GRPC_BIND: "8.8.8.8:50052" }],
    ["host name", { AGENT_RUNTIME_GRPC_BIND: "localhost:50052" }],
    ["missing workspace", { AGENT_RUNTIME_PROJECT_WORKSPACE_ROOT: undefined }],
    ["filesystem workspace root", { AGENT_RUNTIME_PROJECT_WORKSPACE_ROOT: "/" }],
    ["missing state", { AGENT_RUNTIME_STATE_ROOT: undefined }],
    ["missing pool", { AGENT_RUNTIME_CODEX_AUTH_POOL_ROOT: undefined }],
    ["missing manifest", { AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST: undefined }],
    ["missing CLI", { AGENT_RUNTIME_CLI_PATH: undefined }],
    ["relative CLI", { AGENT_RUNTIME_CLI_PATH: "cli.mjs" }],
    ["CLI traversal", { AGENT_RUNTIME_CLI_PATH: "/tmp/../tmp/cli.mjs" }],
    ["ephemeral state", { AGENT_RUNTIME_EPHEMERAL: "true" }],
  ])("fails closed for %s", (_label, override) => {
    expect(() => resolveAgentRuntimeSettings({ ...env, ...override })).toThrow();
  });

  it("accepts a correctly ranged IPv6 unique-local bind", () => {
    expect(resolveAgentRuntimeSettings({ ...env, AGENT_RUNTIME_GRPC_BIND: "[fc00::1]:50052" }).strictAdmission).toBeDefined();
  });

  it("rejects pool manifests that the launcher parser cannot use", async () => {
    const manifest = env.AGENT_RUNTIME_CODEX_AUTH_POOL_MANIFEST!;
    const account = { id: "fixture", relativePath: "snapshots/fixture/auth.json" };
    const base = { schemaVersion: 1, snapshotId: "fixture", accounts: [account] };
    for (const invalid of [
      { ...base, accounts: [account, account] },
      { ...base, accounts: [account, { id: "other", relativePath: account.relativePath }] },
      { ...base, extra: true },
      { ...base, accounts: [{ ...account, extra: true }] },
      { ...base, accounts: [{ ...account, relativePath: "snapshots//fixture/auth.json" }] },
      { ...base, accounts: [{ ...account, relativePath: "snapshots\\fixture\\auth.json" }] },
    ]) {
      await writeFile(manifest, JSON.stringify(invalid));
      expect(() => resolveAgentRuntimeSettings(env)).toThrow();
    }
  });

  it("rejects a symlinked CLI and missing pool account reference", async () => {
    const alias = join(fixtureRoot, "cli-alias");
    await symlink(env.AGENT_RUNTIME_CLI_PATH!, alias);
    expect(() => resolveAgentRuntimeSettings({ ...env, AGENT_RUNTIME_CLI_PATH: alias })).toThrow();
    await rm(join(fixtureRoot, "pool", "snapshots", "fixture", "auth.json"));
    expect(() => resolveAgentRuntimeSettings(env)).toThrow();
  });

  it("keeps writable state, pool references and CLI outside the task workspace", async () => {
    const stateInside = join(workspace, "state");
    await mkdir(stateInside);
    expect(() => resolveAgentRuntimeSettings({ ...env, AGENT_RUNTIME_STATE_ROOT: stateInside })).toThrow();
    expect(() => resolveAgentRuntimeSettings({ ...env, AGENT_RUNTIME_PROJECT_WORKSPACE_ROOT: fixtureRoot })).toThrow();
    const cliInside = join(workspace, "cli.mjs");
    await writeFile(cliInside, "#!/usr/bin/env node\n");
    await chmod(cliInside, 0o755);
    expect(() => resolveAgentRuntimeSettings({ ...env, AGENT_RUNTIME_CLI_PATH: cliInside })).toThrow();
  });

  it("rejects empty, relative, traversal, symlink and foreign mount cwd", async () => {
    const admission = resolveAgentRuntimeSettings(env).strictAdmission!;
    const alias = join(workspace, "alias");
    await symlink(join(workspace, "nested"), alias);
    for (const cwd of ["", "nested", `${workspace}/../project/nested`, fixtureRoot, alias]) {
      expect(() => admitStrictCwd(cwd, admission)).toThrow();
    }
    expect(() => admitStrictCwd(join(workspace, "nested"), admission, () => [join(workspace, "nested")])).toThrow("foreign mount");
    expect(admitStrictCwd(join(workspace, "nested"), admission, () => [])).toBe(join(workspace, "nested"));
  });

  it("rejects unauthorized Health and RunAgentTask before executor calls", async () => {
    const calls: string[] = [];
    const executor: AgentRuntimeExecutorPort = {
      execute: async () => { calls.push("task"); return { status: "completed", warnings: [] }; },
      checkHealth: async () => { calls.push("health"); return { healthy: true, runtimeEngine: "fixture", runtimeVersion: "1", warnings: [] }; },
    };
    const service = createAgentRuntimeGrpcService(executor, {
      serviceToken: "x",
      strictAdmission: resolveAgentRuntimeSettings(env).strictAdmission,
    });
    const invokeTask = (cwd: string, metadata: Metadata) => new Promise<status | undefined>((resolve) => {
      service.runAgentTask({ request: request(cwd), metadata } as Parameters<typeof service.runAgentTask>[0],
        (error) => resolve(error?.code));
    });
    const invokeHealth = (metadata: Metadata) => new Promise<status | undefined>((resolve) => {
      service.checkHealth({ request: {}, metadata } as Parameters<typeof service.checkHealth>[0],
        (error) => resolve(error?.code));
    });
    expect(await invokeTask(workspace, new Metadata())).toBe(status.UNAUTHENTICATED);
    expect(await invokeHealth(new Metadata())).toBe(status.UNAUTHENTICATED);
    const missingTokenService = createAgentRuntimeGrpcService(executor, {
      strictAdmission: resolveAgentRuntimeSettings(env).strictAdmission,
    });
    expect(await new Promise<status | undefined>((resolve) => {
      const supplied = new Metadata();
      supplied.set("authorization", `Bearer ${env.AGENT_RUNTIME_SERVICE_TOKEN}`);
      missingTokenService.checkHealth({ request: {}, metadata: supplied } as Parameters<typeof service.checkHealth>[0],
        (error) => resolve(error?.code));
    })).toBe(status.UNAUTHENTICATED);
    const wrong = new Metadata();
    wrong.set("authorization", `Bearer ${env.AGENT_RUNTIME_SERVICE_TOKEN}-extra`);
    expect(await invokeTask(workspace, wrong)).toBe(status.UNAUTHENTICATED);
    const duplicate = new Metadata();
    duplicate.add("authorization", `Bearer ${env.AGENT_RUNTIME_SERVICE_TOKEN}`);
    duplicate.add("authorization", `Bearer ${env.AGENT_RUNTIME_SERVICE_TOKEN}`);
    expect(await invokeHealth(duplicate)).toBe(status.UNAUTHENTICATED);
    expect(calls).toEqual([]);
    const good = new Metadata();
    good.set("authorization", `Bearer ${env.AGENT_RUNTIME_SERVICE_TOKEN}`);
    const alias = join(workspace, "alias");
    await symlink(join(workspace, "nested"), alias);
    for (const cwd of ["", "nested", fixtureRoot, `${workspace}/../project/nested`, alias]) {
      expect(await invokeTask(cwd, good)).toBe(status.INVALID_ARGUMENT);
    }
    expect(calls).toEqual([]);
    // Mountinfo is intentionally required by the production Linux admission path.
    expect(await invokeTask(join(workspace, "nested"), good)).toBe(
      process.platform === "linux" ? undefined : status.INVALID_ARGUMENT,
    );
    expect(await invokeHealth(good)).toBeUndefined();
    expect(calls).toEqual(process.platform === "linux" ? ["task", "health"] : ["health"]);
  });
});

const request = (cwd: string): AgentRuntimeTaskRequest => ({
  schemaVersion: 1,
  requestId: "fixture-request",
  tenantId: "fixture-tenant",
  workspaceId: "fixture-workspace",
  correlationId: "fixture-correlation",
  provider: AgentRuntimeProvider.AGENT_RUNTIME_PROVIDER_CODEX,
  providerInstanceId: "",
  purpose: "social_monitor.summary.generate",
  systemPrompt: "fixture",
  prompt: "fixture",
  outputSchemaJson: "{}",
  controlsJson: "{}",
  timeoutMs: 1000,
  cwd,
  metadata: {},
});
