import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  chmod,
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
import { attachExecutorOwnedExecutionAttestation } from "./subscription-runtime-execution-attestation";
import { admitSubscriptionRuntimeRequest } from "./subscription-runtime-purpose-model-policy";

import {
  approvedSubscriptionRuntimeLauncherSha256,
  approvedSubscriptionRuntimePackageVersion,
  FileSubscriptionRuntimeInstallationInspector,
  resolveSubscriptionRuntimeExecutable,
} from "./subscription-runtime-installation";

const launcherName = "run-codex-subscription-runtime-agent-task.mjs";
const dependencyNames = [
  "pinned-codex-native-binary.mjs",
  "subscription-runtime-failure-details.mjs",
  "codex-worker-cli-usage.mjs",
  "codex-auth-pool-manifest.mjs",
  "codex-auth-pool-routing.mjs",
  "subscription-runtime-purpose-model-policy.mjs",
  "reader-promotion-v2-canary-contract.cjs",
];

describe("subscription runtime installation admission", () => {
  let root: string | undefined;
  let installationRoot: string;
  let previousPath: string | undefined;

  beforeAll(async () => {
    installationRoot = await mkdtemp(join(tmpdir(), "runtime-main42-sm1-installation-"));
    const modules = join(installationRoot, "node_modules");
    const packageRoot = join(modules, "@vioxen/subscription-runtime");
    await mkdir(packageRoot, { recursive: true });
    const archive = join(process.cwd(), "vendor/vioxen-subscription-runtime-0.1.0-main.42-sm.1.tgz");
    expect(createHash("sha256").update(await readFile(archive)).digest("hex")).toBe(
      "66a8bdf6ae680bd3548fc92df140fb9df2202c829f946b9122393090faf9e31e",
    );
    await promisify(execFile)("tar", [
      "-xzf", archive, "-C", packageRoot, "--strip-components=1",
    ], { timeout: 10_000 });
    // Reuse provided dependencies without installing or changing their bytes.
    const providedModules = await realpath(join(process.cwd(), "node_modules"));
    for (const name of await readdir(providedModules)) {
      if (name === "@vioxen") continue;
      await symlink(join(providedModules, name), join(modules, name));
    }
    for (const name of await readdir(join(providedModules, "@vioxen"))) {
      if (name === "subscription-runtime") continue;
      await symlink(join(providedModules, "@vioxen", name), join(modules, "@vioxen", name));
    }
    expect(JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"))).toMatchObject({
      name: "@vioxen/subscription-runtime", version: "0.1.0-main.42-sm.1",
    });
  }, 15_000);

  afterAll(async () => {
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

  it("admits the exact repository launcher and vendored main.42-sm.1 in a sandbox", async () => {
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
    { name: "@vioxen/subscription-runtime", version: "0.1.0-main.42-sm.2" },
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
