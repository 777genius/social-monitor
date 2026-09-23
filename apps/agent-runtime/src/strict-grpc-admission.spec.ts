import { Metadata, status } from "@grpc/grpc-js";
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
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

  it.each([
    ["missing token", { AGENT_RUNTIME_SERVICE_TOKEN: undefined }],
    ["wildcard bind", { AGENT_RUNTIME_GRPC_BIND: "0.0.0.0:50052" }],
    ["IPv6 wildcard", { AGENT_RUNTIME_GRPC_BIND: "[::]:50052" }],
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
      supplied.set("authorization", "Bearer x");
      missingTokenService.checkHealth({ request: {}, metadata: supplied } as Parameters<typeof service.checkHealth>[0],
        (error) => resolve(error?.code));
    })).toBe(status.UNAUTHENTICATED);
    const wrong = new Metadata();
    wrong.set("authorization", "Bearer x-extra");
    expect(await invokeTask(workspace, wrong)).toBe(status.UNAUTHENTICATED);
    const duplicate = new Metadata();
    duplicate.add("authorization", "Bearer x");
    duplicate.add("authorization", "Bearer x");
    expect(await invokeHealth(duplicate)).toBe(status.UNAUTHENTICATED);
    expect(calls).toEqual([]);
    const good = new Metadata();
    good.set("authorization", "Bearer x");
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
