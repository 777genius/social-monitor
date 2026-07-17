import {
  chmod,
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

describe("subscription runtime installation admission", () => {
  let root: string | undefined;
  let previousPath: string | undefined;

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
      runtimePackageVersion: approvedSubscriptionRuntimePackageVersion,
      launcherSha256: approvedSubscriptionRuntimeLauncherSha256,
    });
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
