import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  appendFile,
  chmod,
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { assessmentRequest } from "./source-content-assessment-runtime.spec-support";
import type { AgentRuntimeExecutionRequest } from "./agent-runtime-executor.port";
import { attachExecutorOwnedExecutionAttestation } from "./subscription-runtime-execution-attestation";
import { SubscriptionRuntimeCliExecutor } from "./subscription-runtime-cli-executor";
import { admitSubscriptionRuntimeRequest } from "./subscription-runtime-purpose-model-policy";

import {
  approvedSubscriptionRuntimeLauncherSha256,
  approvedSubscriptionRuntimePackageVersion,
  FileSubscriptionRuntimeInstallationInspector,
  resolveSubscriptionRuntimeExecutable,
} from "./subscription-runtime-installation";

const launcherName = "run-codex-subscription-runtime-agent-task.mjs";
// Inventories traverse real installed bytes. Keep the admitted fixture immutable;
// writable variants use copy-on-write where the filesystem supports it.
const cloneInstalledPackage = (source: string, destination: string) =>
  cp(source, destination, { recursive: true, mode: constants.COPYFILE_FICLONE });
const distributionIoTimeoutMs = 30_000;
const dependencyNames = [
  "assessment-cli-lifecycle.mjs",
  "mimo-app-server-custody.mjs", "installed-runtime-modules.mjs",
  "assessment-cli-progress.mjs",
  "pinned-codex-native-binary.mjs",
  "subscription-runtime-failure-details.mjs",
  "mimo-key-file.mjs",
  "codex-worker-cli-usage.mjs",
  "codex-auth-pool-manifest.mjs",
  "codex-auth-pool-routing.mjs",
  "subscription-runtime-purpose-model-policy.mjs",
  "reader-promotion-v2-canary-contract.cjs",
];
const mimoRequest = (): AgentRuntimeExecutionRequest => ({
  requestId: "synthetic-mimo-request",
  tenantId: "synthetic-tenant",
  workspaceId: "synthetic-workspace",
  correlationId: "synthetic-correlation",
  provider: "codex",
  purpose: "social_monitor.reader_summary.topic_map.label.v2",
  systemPrompt: "Return labels.",
  prompt: "Synthetic topic input.",
  outputSchemaJson: JSON.stringify({ type: "object", additionalProperties: false,
    required: ["nodeLabels", "groups"], properties: { nodeLabels: { type: "array" }, groups: { type: "array" } } }),
  controlsJson: JSON.stringify({ model: "mimo-v2.6-pro", modelBackend: "xiaomi-mimo-token-plan",
    outputSchemaName: "social_monitor_reader_summary_topic_map_labels", schemaVersion: "reader_summary.topic_map.v1" }),
  timeoutMs: 10_000,
  metadata: {},
});

describe("subscription runtime installation admission", () => {
  let root: string | undefined;
  let installationRoot: string;
  let installationSetup: Promise<void> | undefined;
  let previousPath: string | undefined;

  const setupInstallation = async () => {
    const rootManifest = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
    expect(rootManifest.dependencies["@vioxen/subscription-runtime"]).toBe(
      `file:vendor/vioxen-subscription-runtime-${approvedSubscriptionRuntimePackageVersion}.tgz`,
    );
    installationRoot = await mkdtemp(join(tmpdir(), "runtime-main42-sm3-installation-"));
    const modules = join(installationRoot, "node_modules");
    const packageRoot = join(modules, "@vioxen/subscription-runtime");
    await mkdir(packageRoot, { recursive: true });
    const archive = join(process.cwd(), "vendor/vioxen-subscription-runtime-0.1.0-main.42-sm.3.tgz");
    expect(createHash("sha256").update(await readFile(archive)).digest("hex")).toBe(
      "68e664272bc4dc9e8ba51327b4cac456c7feff731abc02f7e36ba1b3105bd85b",
    );
    await promisify(execFile)("tar", [
      "-xzf", archive, "-C", packageRoot, "--strip-components=1",
    ], { timeout: 10_000 });
    // npm completes bundled dependencies missing from the archive. The
    // inspector admits this complete installed code identity only.
    await cp(join(process.cwd(), "node_modules/@vioxen/subscription-runtime/node_modules"),
      join(packageRoot, "node_modules"), { recursive: true, force: true });
    const mimoPackageRoot = join(modules, "@vioxen/subscription-runtime-mimo");
    await mkdir(mimoPackageRoot, { recursive: true });
    const mimoArchive = join(process.cwd(), "vendor/vioxen-subscription-runtime-0.1.0-main.40-sm-mimo.5.tgz");
    expect(createHash("sha256").update(await readFile(mimoArchive)).digest("hex")).toBe(
      "d7b3698fdc189cff118cc15464e48db999fd19f6ae8286701dec896ab5e63525",
    );
    await promisify(execFile)("tar", [
      "-xzf", mimoArchive,
      "-C", mimoPackageRoot, "--strip-components=1",
    ], { timeout: 10_000 });
    // Reuse provided dependencies without installing or changing their bytes.
    const providedModules = await realpath(join(process.cwd(), "node_modules"));
    for (const name of await readdir(providedModules)) {
      if (name === "@vioxen") continue;
      await symlink(join(providedModules, name), join(modules, name));
    }
    for (const name of await readdir(join(providedModules, "@vioxen"))) {
      if (name === "subscription-runtime" || name === "subscription-runtime-mimo") continue;
      await symlink(join(providedModules, "@vioxen", name), join(modules, "@vioxen", name));
    }
    expect(JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"))).toMatchObject({
      name: "@vioxen/subscription-runtime", version: "0.1.0-main.42-sm.3",
    });
  };

  beforeAll(() => {
    installationSetup = setupInstallation();
    return installationSetup;
  }, distributionIoTimeoutMs);

  afterAll(async () => {
    // Jest's timeout does not cancel filesystem work started by beforeAll.
    await installationSetup?.catch(() => undefined);
    if (installationRoot !== undefined) {
      await rm(installationRoot, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    previousPath = process.env.PATH;
  });

  afterEach(async () => {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    previousPath = undefined;
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  it("admits the exact repository launcher and vendored main.42-sm.3 in a sandbox", async () => {
    const command = join(await copyInstallation(), launcherName);

    await expect(
      new FileSubscriptionRuntimeInstallationInspector().inspect(command),
    ).resolves.toMatchObject({
      executablePath: await realpath(command),
      packageRootRealpath: await realpath(
        join(installationRoot, "node_modules/@vioxen/subscription-runtime"),
      ),
      runtimePackageVersion: approvedSubscriptionRuntimePackageVersion,
      launcherSha256: approvedSubscriptionRuntimeLauncherSha256,
    });
  });

  it("attests the isolated MiMo backend version for summary admission", async () => {
    const command = join(await copyInstallation(), launcherName);
    const workspace = join(root!, "workspace");
    await mkdir(workspace);
    await expect(new FileSubscriptionRuntimeInstallationInspector(workspace).inspect(
      command, "xiaomi-mimo-token-plan",
    )).resolves.toMatchObject({
      runtimePackageVersion: approvedSubscriptionRuntimePackageVersion,
      mimoRuntimePackageVersion: "0.1.0-main.40-sm-mimo.5",
    });
    const health = await new SubscriptionRuntimeCliExecutor({
      command, ephemeral: false, workspaceRoot: workspace,
      allowedModelBackends: ["xiaomi-mimo-token-plan"],
    }).checkHealth();
    expect(health).toMatchObject({ healthy: true, runtimeVersion: "0.1.0-main.40-sm-mimo.5" });
  }, distributionIoTimeoutMs);

  it("rejects the base archive without its locked installed dependency completion", async () => {
    const command = join(await copyInstallation(), launcherName);
    await rm(join(root!, "node_modules"));
    const modules = join(root!, "node_modules/@vioxen");
    const base = join(modules, "subscription-runtime");
    await mkdir(base, { recursive: true });
    await promisify(execFile)("tar", ["-xzf",
      join(process.cwd(), "vendor/vioxen-subscription-runtime-0.1.0-main.42-sm.3.tgz"),
      "-C", base, "--strip-components=1"], { timeout: 10_000 });
    await symlink(join(installationRoot, "node_modules/@vioxen/subscription-runtime-mimo"),
      join(modules, "subscription-runtime-mimo"));
    await expect(new FileSubscriptionRuntimeInstallationInspector().inspect(
      command, "xiaomi-mimo-token-plan",
    )).rejects.toThrow("Installed subscription runtime code bytes are not approved");
  });

  const isolatedSelectedPackage = async (): Promise<string> => {
    await rm(join(root!, "node_modules"));
    const selected = join(root!, "node_modules/@vioxen/subscription-runtime-mimo");
    await mkdir(join(root!, "node_modules/@vioxen"), { recursive: true });
    await symlink(join(installationRoot, "node_modules/@vioxen/subscription-runtime"),
      join(root!, "node_modules/@vioxen/subscription-runtime"));
    await mkdir(selected);
    await copyFile(join(installationRoot, "node_modules/@vioxen/subscription-runtime-mimo/package.json"),
      join(selected, "package.json"));
    return selected;
  };

  it("rejects a selected package symlink into the admitted workspace before health or execution", async () => {
    const bin = await copyInstallation();
    const command = join(bin, launcherName);
    const workspace = join(root!, "workspace");
    await mkdir(workspace);
    const selected = await isolatedSelectedPackage();
    await rename(selected, join(workspace, "selected-runtime"));
    await symlink(join(workspace, "selected-runtime"), selected);
    const inspector = new FileSubscriptionRuntimeInstallationInspector(workspace);
    await expect(inspector.inspect(command, "xiaomi-mimo-token-plan"))
      .rejects.toThrow("outside the admitted workspace");
    const executor = new SubscriptionRuntimeCliExecutor({
      command, ephemeral: false, workspaceRoot: workspace,
      mimoApiKeyFile: join(root!, "synthetic-key-path"),
      allowedModelBackends: ["xiaomi-mimo-token-plan"],
    });
    await expect(executor.checkHealth()).resolves.toMatchObject({ healthy: false });
    await expect(executor.execute(mimoRequest())).resolves.toMatchObject({
      status: "failed", failure: { code: "agent_runtime.execution_attestation_invalid" },
    });
  });

  it("rejects a pinned-looking manifest symlink into the admitted workspace", async () => {
    const bin = await copyInstallation();
    const workspace = join(root!, "workspace");
    await mkdir(workspace);
    const selected = await isolatedSelectedPackage();
    await rename(join(selected, "package.json"), join(workspace, "package.json"));
    await symlink(join(workspace, "package.json"), join(selected, "package.json"));
    await expect(new FileSubscriptionRuntimeInstallationInspector(workspace).inspect(
      join(bin, launcherName), "xiaomi-mimo-token-plan",
    )).rejects.toThrow(/outside the admitted workspace|regular installation entries/);
  });

  it("rejects a pinned-looking selected package with no worker entrypoint before healthy status", async () => {
    const bin = await copyInstallation();
    const command = join(bin, launcherName);
    await isolatedSelectedPackage();
    const inspector = new FileSubscriptionRuntimeInstallationInspector();
    await expect(inspector.inspect(command, "xiaomi-mimo-token-plan"))
      .rejects.toMatchObject({ code: "ENOENT" });
    const executor = new SubscriptionRuntimeCliExecutor({
      command, ephemeral: false, mimoApiKeyFile: join(root!, "synthetic-key-path"),
      allowedModelBackends: ["xiaomi-mimo-token-plan"],
    });
    await expect(executor.checkHealth()).resolves.toMatchObject({ healthy: false });
    await expect(executor.execute(mimoRequest())).resolves.toMatchObject({
      status: "failed", failure: { code: "agent_runtime.execution_attestation_invalid" },
    });
  });

  it("rejects a changed MiMo worker entrypoint even with the pinned manifest", async () => {
    const bin = await copyInstallation();
    const selected = await isolatedSelectedPackage();
    const workerDirectory = join(selected, "dist/worker-codex");
    await mkdir(workerDirectory, { recursive: true });
    await writeFile(join(workerDirectory, "index.js"), "export const createOneShotExecutor = () => null;\n");
    await expect(new FileSubscriptionRuntimeInstallationInspector().inspect(
      join(bin, launcherName), "xiaomi-mimo-token-plan",
    )).rejects.toThrow("worker entrypoint bytes are not approved");
  });

  it.each(["missing", "tampered"])("rejects a %s imported MiMo factory", async (change) => {
    const command = join(await copyInstallation(), launcherName);
    await rm(join(root!, "node_modules"));
    const modules = join(root!, "node_modules/@vioxen");
    await mkdir(modules, { recursive: true });
    await symlink(join(installationRoot, "node_modules/@vioxen/subscription-runtime"),
      join(modules, "subscription-runtime"));
    const selected = join(modules, "subscription-runtime-mimo");
    await cloneInstalledPackage(join(installationRoot, "node_modules/@vioxen/subscription-runtime-mimo"), selected);
    const factory = join(selected, "dist/worker-codex/file-backend-codex-executor-factories.js");
    if (change === "missing") await rm(factory);
    else await appendFile(factory, "\n// synthetic altered implementation\n");
    await expect(new FileSubscriptionRuntimeInstallationInspector().inspect(
      command, "xiaomi-mimo-token-plan",
    )).rejects.toThrow("Installed subscription runtime code bytes are not approved");
  }, distributionIoTimeoutMs);

  it.each([
    ["subscription-runtime", "dist"], ["subscription-runtime-mimo", "dist"],
    ["subscription-runtime", "."], ["subscription-runtime-mimo", "."],
  ])(
    "rejects an added executable extensionless file in %s/%s", async (name, location) => {
      const command = join(await copyInstallation(), launcherName);
      await rm(join(root!, "node_modules"));
      const modules = join(root!, "node_modules/@vioxen");
      await mkdir(modules, { recursive: true });
      for (const external of await readdir(join(installationRoot, "node_modules"))) {
        if (external !== "@vioxen") await symlink(join(installationRoot, "node_modules", external),
          join(root!, "node_modules", external));
      }
      for (const packageName of ["subscription-runtime", "subscription-runtime-mimo"]) {
        const destination = join(modules, packageName);
        if (packageName === name) {
          await cloneInstalledPackage(join(installationRoot, "node_modules/@vioxen", packageName), destination);
        } else {
          await symlink(join(installationRoot, "node_modules/@vioxen", packageName), destination);
        }
      }
      const added = join(modules, name, location, "synthetic-extensionless-tool");
      await writeFile(added, "#!/bin/sh\nexit 0\n");
      await chmod(added, 0o755);
      await expect(new FileSubscriptionRuntimeInstallationInspector().inspect(
        command, "xiaomi-mimo-token-plan",
      )).rejects.toThrow("Installed subscription runtime code bytes are not approved");
    },
    distributionIoTimeoutMs,
  );

  it("rejects changed base CLI implementation behind a version-correct manifest", async () => {
    const command = join(await copyInstallation(), launcherName);
    await rm(join(root!, "node_modules"));
    const modules = join(root!, "node_modules/@vioxen");
    await mkdir(modules, { recursive: true });
    const base = join(modules, "subscription-runtime");
    await cp(join(process.cwd(), "node_modules/@vioxen/subscription-runtime"), base,
      { recursive: true });
    await symlink(join(installationRoot, "node_modules/@vioxen/subscription-runtime-mimo"),
      join(modules, "subscription-runtime-mimo"));
    await appendFile(join(base, "dist/worker-local/agent-task-runner/cli.js"),
      "\n// synthetic altered implementation\n");
    await expect(new FileSubscriptionRuntimeInstallationInspector().inspect(
      command, "xiaomi-mimo-token-plan",
    )).rejects.toThrow("Installed subscription runtime code bytes are not approved");
  });

  it("rejects an imported MiMo factory symlink into the admitted workspace before spawn or attestation", async () => {
    const bin = await copyInstallation();
    const nestedBin = join(root!, "apps/agent-runtime/bin");
    await mkdir(join(root!, "apps/agent-runtime"), { recursive: true });
    await cp(bin, nestedBin, { recursive: true });
    const command = join(nestedBin, launcherName);
    const workspace = join(root!, "workspace");
    await mkdir(workspace);
    await rm(join(root!, "node_modules"));
    const modules = join(root!, "node_modules/@vioxen");
    await mkdir(modules, { recursive: true });
    for (const name of await readdir(join(process.cwd(), "node_modules"))) {
      if (name !== "@vioxen") await symlink(join(process.cwd(), "node_modules", name),
        join(root!, "node_modules", name));
    }
    await symlink(join(process.cwd(), "node_modules/@vioxen/subscription-runtime"),
      join(modules, "subscription-runtime"));
    const selected = join(modules, "subscription-runtime-mimo");
    await cloneInstalledPackage(join(installationRoot, "node_modules/@vioxen/subscription-runtime-mimo"), selected);
    const inspector = new FileSubscriptionRuntimeInstallationInspector(workspace);
    const request = { ...mimoRequest(), cwd: workspace };
    const admission = admitSubscriptionRuntimeRequest(request);
    const admittedInstallation = await inspector.inspect(command, "xiaomi-mimo-token-plan");
    const attest = () => attachExecutorOwnedExecutionAttestation({
      command, request, ...admission, admittedInstallation, installationInspector: inspector,
      result: { status: "completed", structuredOutput: { nodeLabels: [], groups: [] }, warnings: [] },
    });
    expect((await attest()).executionAttestation).toBeDefined();
    const factory = join(selected, "dist/worker-codex/file-backend-codex-executor-factories.js");
    const altered = join(workspace, "file-backend-codex-executor-factories.js");
    await writeFile(altered, "export const createOneShotExecutor = () => ({ run: async () => " +
      "({ status: 'completed', result: { structuredOutput: { nodeLabels: [], groups: [] }, warnings: [] } }), " +
      "dispose: async () => {} });\n");
    await rm(factory);
    await symlink(altered, factory);
    const keyPath = join(root!, "synthetic-generated-key");
    const inputPath = join(root!, "synthetic-request.json");
    await writeFile(keyPath, `synthetic-${createHash("sha256").update(root!).digest("hex")}`, { mode: 0o600 });
    await writeFile(inputPath, JSON.stringify(admission.canonicalRequest));
    const forged = await promisify(execFile)(command, [
      "--provider", "codex", "--input", inputPath, "--format", "result-json",
      "--timeout-ms", "10000", "--model", "mimo-v2.6-pro", "--ephemeral",
    ], { cwd: workspace, env: {
      PATH: process.env.PATH ?? "", TMPDIR: tmpdir(), AGENT_RUNTIME_MIMO_API_KEY_FILE: keyPath,
      AGENT_RUNTIME_REASONING_EFFORT: "high",
    }, timeout: 10_000 }).catch((error: Error & { stdout?: string; stderr?: string }) => ({
      stdout: error.stdout ?? "", stderr: error.stderr ?? "",
    }));
    expect(forged.stderr).toBe("");
    expect(JSON.parse(forged.stdout)).toMatchObject({
      status: "completed", structuredOutput: { nodeLabels: [], groups: [] },
    });
    await expect(inspector.inspect(command, "xiaomi-mimo-token-plan"))
      .rejects.toThrow(/non-regular entry/);
    await expect(attest()).resolves.toMatchObject({
      status: "failed", failure: { code: "agent_runtime.execution_attestation_invalid" },
    });
    const executor = new SubscriptionRuntimeCliExecutor({
      command, ephemeral: false, workspaceRoot: workspace,
      mimoApiKeyFile: join(root!, "synthetic-key-path"),
      allowedModelBackends: ["xiaomi-mimo-token-plan"],
    });
    await expect(executor.checkHealth()).resolves.toMatchObject({ healthy: false });
    await expect(executor.execute(mimoRequest())).resolves.toMatchObject({
      status: "failed", failure: { code: "agent_runtime.execution_attestation_invalid" },
    });
  }, 45_000);

  it("loads the selected base CLI from a bare package layout, then rejects its workspace symlink", async () => {
    const bin = await copyInstallation();
    const command = join(bin, launcherName);
    const workspace = join(root!, "workspace");
    await mkdir(workspace);
    await rm(join(root!, "node_modules"));
    const modules = join(root!, "node_modules/@vioxen");
    await mkdir(modules, { recursive: true });
    for (const name of await readdir(join(process.cwd(), "node_modules"))) {
      if (name !== "@vioxen") await symlink(join(process.cwd(), "node_modules", name),
        join(root!, "node_modules", name));
    }
    const fakeBase = join(workspace, "base-runtime");
    await cp(join(process.cwd(), "node_modules/@vioxen/subscription-runtime"), fakeBase,
      { recursive: true });
    await writeFile(join(fakeBase, "dist/worker-local/agent-task-runner/cli.js"),
      "export async function runSubscriptionAgentTaskCli() { " +
      "process.stdout.write(JSON.stringify({ protocolVersion: 1, status: 'completed', " +
      "structuredOutput: { nodeLabels: [], groups: [] }, warnings: [] })); return 0; }\n");
    await symlink(fakeBase, join(modules, "subscription-runtime"));
    await symlink(join(installationRoot, "node_modules/@vioxen/subscription-runtime-mimo"),
      join(modules, "subscription-runtime-mimo"));
    const keyPath = join(root!, "synthetic-generated-key");
    const inputPath = join(root!, "synthetic-request.json");
    await writeFile(keyPath, `synthetic-${createHash("sha256").update(root!).digest("hex")}`, { mode: 0o600 });
    await writeFile(inputPath, JSON.stringify(admitSubscriptionRuntimeRequest({
      ...mimoRequest(), cwd: workspace,
    }).canonicalRequest));
    const forged = await promisify(execFile)(command, [
      "--provider", "codex", "--input", inputPath, "--format", "result-json",
      "--timeout-ms", "10000", "--model", "mimo-v2.6-pro", "--ephemeral",
    ], { cwd: workspace, env: {
      PATH: process.env.PATH ?? "", TMPDIR: tmpdir(), AGENT_RUNTIME_MIMO_API_KEY_FILE: keyPath,
      AGENT_RUNTIME_REASONING_EFFORT: "high",
    }, timeout: 10_000 });
    expect(JSON.parse(forged.stdout)).toMatchObject({
      status: "completed", structuredOutput: { nodeLabels: [], groups: [] },
    });
    const inspector = new FileSubscriptionRuntimeInstallationInspector(workspace);
    await expect(inspector.inspect(command, "xiaomi-mimo-token-plan"))
      .rejects.toThrow(/outside the admitted workspace|regular manifest/);
    const executor = new SubscriptionRuntimeCliExecutor({
      command, ephemeral: false, workspaceRoot: workspace,
      mimoApiKeyFile: keyPath, allowedModelBackends: ["xiaomi-mimo-token-plan"],
    });
    await expect(executor.checkHealth()).resolves.toMatchObject({ healthy: false });
    await expect(executor.execute({ ...mimoRequest(), cwd: workspace })).resolves.toMatchObject({
      status: "failed", failure: { code: "agent_runtime.execution_attestation_invalid" },
    });
  });

  it("rejects a hoisted import that resolves into the admitted workspace", async () => {
    const command = join(await copyInstallation(), launcherName);
    const workspace = join(root!, "workspace");
    await mkdir(workspace);
    await rm(join(root!, "node_modules"));
    await mkdir(join(root!, "node_modules/@vioxen"), { recursive: true });
    for (const name of await readdir(join(installationRoot, "node_modules"))) {
      if (name === "@vioxen" || name === "zod-to-json-schema") continue;
      await symlink(join(installationRoot, "node_modules", name), join(root!, "node_modules", name));
    }
    for (const name of ["subscription-runtime", "subscription-runtime-mimo"]) {
      const destination = join(root!, "node_modules/@vioxen", name);
      if (name === "subscription-runtime-mimo") {
        await cloneInstalledPackage(join(installationRoot, "node_modules/@vioxen", name), destination);
      } else {
        await symlink(join(installationRoot, "node_modules/@vioxen", name), destination);
      }
    }
    const workspaceImport = join(workspace, "zod-to-json-schema");
    await cp(join(process.cwd(), "node_modules/zod-to-json-schema"), workspaceImport,
      { recursive: true });
    await symlink(workspaceImport, join(root!, "node_modules/zod-to-json-schema"));
    await expect(new FileSubscriptionRuntimeInstallationInspector(workspace).inspect(
      command, "xiaomi-mimo-token-plan",
    )).rejects.toThrow("Installed runtime import is inside the admitted workspace: zod-to-json-schema");
  }, distributionIoTimeoutMs);

  it("rejects a changed MiMo package only when that backend is admitted", async () => {
    const command = join(await copyInstallation(), launcherName);
    await rm(join(root!, "node_modules"));
    const modules = join(root!, "node_modules/@vioxen");
    await mkdir(join(modules, "subscription-runtime"), { recursive: true });
    await mkdir(join(modules, "subscription-runtime-mimo"), { recursive: true });
    await writeFile(join(modules, "subscription-runtime/package.json"), JSON.stringify({
      name: "@vioxen/subscription-runtime", version: approvedSubscriptionRuntimePackageVersion,
    }));
    await writeFile(join(modules, "subscription-runtime-mimo/package.json"), JSON.stringify({
      name: "@vioxen/subscription-runtime", version: "0.0.0-synthetic-unapproved",
    }));
    const inspector = new FileSubscriptionRuntimeInstallationInspector();
    await expect(inspector.inspect(command)).resolves.toMatchObject({
      runtimePackageVersion: approvedSubscriptionRuntimePackageVersion,
    });
    await expect(inspector.inspect(command, "xiaomi-mimo-token-plan"))
      .rejects.toThrow("Installed MiMo subscription runtime version is not approved");
  });

  // Copy bytes without executing the wrapper or accessing provider/auth state.
  const copyInstallation = async () => {
    root = await mkdtemp(join(tmpdir(), "runtime-installation-"));
    const bin = join(root, "bin");
    await mkdir(bin);
    for (const name of [launcherName, ...dependencyNames]) {
      await copyFile(join(process.cwd(), "apps/agent-runtime/bin", name), join(bin, name));
    }
    await chmod(join(bin, launcherName), 0o755);
    await symlink(join(installationRoot, "node_modules"), join(root, "node_modules"));
    return bin;
  };

  it.each([launcherName, ...dependencyNames])(
    "rejects changed %s bytes on reinspection of an admitted installation",
    async (name) => {
      const bin = await copyInstallation();
      const command = join(bin, launcherName);
      const inspector = new FileSubscriptionRuntimeInstallationInspector();
      await expect(inspector.inspect(command)).resolves.toMatchObject({
        launcherSha256: approvedSubscriptionRuntimeLauncherSha256,
      });

      await appendFile(join(bin, name), "\n// synthetic tamper\n");

      await expect(inspector.inspect(command)).rejects.toThrow(
        name === launcherName
          ? "Agent runtime launcher bytes are not approved"
          : `Agent runtime launcher dependency bytes are not approved: ${name}`,
      );
    },
  );

  it.each([launcherName, ...dependencyNames])("rejects missing %s", async (name) => {
    const bin = await copyInstallation();
    await rm(join(bin, name));

    const inspection = new FileSubscriptionRuntimeInstallationInspector().inspect(
      join(bin, launcherName),
    );
    if (name === launcherName) {
      await expect(inspection).rejects.toThrow("Agent runtime launcher command cannot be resolved");
    } else {
      await expect(inspection).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("admits a repository directory symlink and a command symlink", async () => {
    const bin = await copyInstallation();
    const repositoryLink = join(root!, "repository-link");
    await symlink(bin, repositoryLink);
    const command = join(root!, "launcher-link");
    await symlink(join(repositoryLink, launcherName), command);

    await expect(new FileSubscriptionRuntimeInstallationInspector().inspect(command))
      .resolves.toMatchObject({ executablePath: await realpath(join(bin, launcherName)) });
  });

  it.each(dependencyNames)("rejects byte-identical symlinked helper %s", async (name) => {
    const bin = await copyInstallation();
    const helper = join(bin, name);
    const relocated = join(root!, name);
    await rename(helper, relocated);
    await symlink(relocated, helper);

    await expect(new FileSubscriptionRuntimeInstallationInspector().inspect(
      join(bin, launcherName),
    )).rejects.toThrow(`Agent runtime launcher dependency is not a regular file: ${name}`);
  });

  it.each(["installation", "post-completion attestation"])(
    "rejects relocated policy with unchecked adjacent CJS during %s",
    async (phase) => {
      const bin = await copyInstallation();
      const command = join(bin, launcherName);
      const inspector = new FileSubscriptionRuntimeInstallationInspector();
      const admittedInstallation = await inspector.inspect(command);
      const request = assessmentRequest();
      const admission = admitSubscriptionRuntimeRequest(request);
      const attest = () => attachExecutorOwnedExecutionAttestation({
        command, request, ...admission, admittedInstallation,
        installationInspector: inspector,
        result: { status: "completed", structuredOutput: { synthetic: true }, warnings: [] },
      });
      expect((await attest()).executionAttestation).toBeDefined();

      const policy = "subscription-runtime-purpose-model-policy.mjs";
      const contract = "reader-promotion-v2-canary-contract.cjs";
      const relocated = join(root!, "relocated");
      await mkdir(relocated);
      const policyBytes = await readFile(join(bin, policy));
      const contractBytes = await readFile(join(bin, contract));
      await rename(join(bin, policy), join(relocated, policy));
      await symlink(join(relocated, policy), join(bin, policy));
      await writeFile(join(relocated, contract),
        'module.exports = { readerPromotionV2CanaryPurpose: "synthetic-unapproved-contract", ' +
        'readerPromotionV2CanaryOutputIsValid: () => true };\n');
      expect(await readFile(join(bin, policy))).toEqual(policyBytes);
      expect(await readFile(join(bin, contract))).toEqual(contractBytes);

      // Native Node imports only the pure policy, never the launcher/provider/auth runtime.
      const loaded = await promisify(execFile)(process.execPath, [
        "--input-type=module", "-e",
        'const policy = await import(process.argv[1]); ' +
        'console.log(JSON.stringify([policy.readerPromotionV2CanaryPurpose, ' +
        'policy.readerPromotionV2CanaryOutputIsValid({})]));',
        pathToFileURL(join(bin, policy)).href,
      ], { timeout: 5_000 });
      expect(JSON.parse(loaded.stdout)).toEqual(["synthetic-unapproved-contract", true]);

      if (phase === "installation") {
        await expect(inspector.inspect(command)).rejects.toThrow(
          `Agent runtime launcher dependency is not a regular file: ${policy}`,
        );
      } else {
        const result = await attest();
        expect(result).toMatchObject({
          status: "failed",
          failure: { code: "agent_runtime.execution_attestation_invalid", retryable: false },
        });
        expect(result.executionAttestation).toBeUndefined();
      }
    },
  );

  it.each([
    { name: "@vioxen/subscription-runtime", version: "0.1.0-main.42" },
    { name: "@vioxen/subscription-runtime", version: "0.1.0-main.42-sm.1" },
    { name: "@vioxen/subscription-runtime", version: "0.0.0-unapproved" },
    { name: "unapproved-runtime", version: approvedSubscriptionRuntimePackageVersion },
  ])("rejects an unapproved package manifest %j", async (manifest) => {
    const bin = await copyInstallation();
    await rm(join(root!, "node_modules"));
    const packageRoot = join(root!, "node_modules/@vioxen/subscription-runtime");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(join(packageRoot, "package.json"), JSON.stringify(manifest));

    await expect(new FileSubscriptionRuntimeInstallationInspector().inspect(
      join(bin, launcherName),
    )).rejects.toThrow("Installed subscription runtime version is not approved");
  });

  it("skips missing and non-executable PATH entries and returns the real path", async () => {
    root = await mkdtemp(join(tmpdir(), "runtime-installation-"));
    const missing = join(root, "missing");
    const blocked = join(root, "blocked");
    const admitted = join(root, "admitted");
    await Promise.all([mkdir(blocked), mkdir(admitted)]);
    const command = "subscription-runtime-run-agent-task";
    await writeFile(join(blocked, command), "blocked", "utf8");
    await chmod(join(blocked, command), 0o644);
    const target = join(admitted, "launcher.mjs");
    await writeFile(target, "#!/usr/bin/env node\n", "utf8");
    await chmod(target, 0o755);
    await symlink(target, join(admitted, command));
    previousPath = process.env.PATH;
    process.env.PATH = [missing, blocked, admitted].join(delimiter);

    await expect(resolveSubscriptionRuntimeExecutable(command)).resolves.toBe(
      await realpath(target),
    );
  });

  it("fails closed when no executable candidate exists", async () => {
    root = await mkdtemp(join(tmpdir(), "runtime-installation-"));
    const command = join(root, "launcher.mjs");
    await writeFile(command, "#!/usr/bin/env node\n", "utf8");
    await chmod(command, 0o644);

    await expect(resolveSubscriptionRuntimeExecutable(command)).rejects.toThrow(
      "cannot be resolved",
    );
  });
});
