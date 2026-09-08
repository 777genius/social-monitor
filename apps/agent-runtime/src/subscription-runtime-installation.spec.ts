import {
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import {
  approvedSubscriptionRuntimeLauncherSha256,
  approvedSubscriptionRuntimePackageVersion,
  FileSubscriptionRuntimeInstallationInspector,
  resolveSubscriptionRuntimeExecutable,
} from "./subscription-runtime-installation";

const launcherName = "run-codex-subscription-runtime-agent-task.mjs";
const dependencyNames = [
  "subscription-runtime-failure-details.mjs",
  "codex-worker-cli-usage.mjs",
  "codex-auth-pool-manifest.mjs",
  "codex-auth-pool-routing.mjs",
  "subscription-runtime-purpose-model-policy.mjs",
  "reader-promotion-v2-canary-contract.cjs",
];

describe("subscription runtime installation admission", () => {
  let root: string | undefined;
  let previousPath: string | undefined;

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

  it("admits the pinned repository launcher and its dependency tree", async () => {
    const command = join(
      process.cwd(),
      "apps/agent-runtime/bin/run-codex-subscription-runtime-agent-task.mjs",
    );

    await expect(
      new FileSubscriptionRuntimeInstallationInspector().inspect(command),
    ).resolves.toMatchObject({
      executablePath: await realpath(command),
      packageRootRealpath: await realpath(
        join(process.cwd(), "node_modules/@vioxen/subscription-runtime"),
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
    await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"));
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

  it("rejects a missing classification helper", async () => {
    const bin = await copyInstallation();
    await rm(join(bin, "subscription-runtime-failure-details.mjs"));

    await expect(new FileSubscriptionRuntimeInstallationInspector().inspect(
      join(bin, launcherName),
    )).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("checks helpers beside the real launcher even through a command symlink", async () => {
    const bin = await copyInstallation();
    const command = join(root!, "launcher-link");
    await symlink(join(bin, launcherName), command);
    const inspector = new FileSubscriptionRuntimeInstallationInspector();
    await expect(inspector.inspect(command)).resolves.toMatchObject({
      executablePath: await realpath(join(bin, launcherName)),
    });
    const helper = join(bin, "subscription-runtime-failure-details.mjs");
    const replacement = join(root!, "replacement.mjs");
    await writeFile(replacement, "export const subscriptionRuntimeFailureDetails = () => ({});\n");
    await rm(helper);
    await symlink(replacement, helper);

    await expect(inspector.inspect(command)).rejects.toThrow(
      "Agent runtime launcher dependency bytes are not approved: subscription-runtime-failure-details.mjs",
    );
  });

  it.each([
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
