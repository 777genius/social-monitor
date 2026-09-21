import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { FileSubscriptionRuntimeInstallationInspector } from "../src/subscription-runtime-installation.ts";

test("sm.3 and its exact launcher are admitted; old pin and altered bytes fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "assessment-runtime-pin-"));
  try {
    const bin = join(root, "bin");
    await cp(new URL(".", import.meta.url), bin, { recursive: true });
    const modules = join(root, "node_modules/@vioxen/subscription-runtime");
    await mkdir(modules, { recursive: true });
    execFileSync("tar", ["-xzf", resolve("vendor/vioxen-subscription-runtime-0.1.0-main.42-sm.3.tgz"),
      "--strip-components=1", "-C", modules]);
    const launcher = join(bin, "run-codex-subscription-runtime-agent-task.mjs");
    await chmod(launcher, 0o755);
    const inspector = new FileSubscriptionRuntimeInstallationInspector();
    assert.equal((await inspector.inspect(launcher)).runtimePackageVersion, "0.1.0-main.42-sm.3");
    const manifestPath = join(modules, "package.json");
    const manifest = await readFile(manifestPath, "utf8");
    await writeFile(manifestPath, manifest.replace("0.1.0-main.42-sm.3", "0.1.0-main.42-sm.2"));
    await assert.rejects(inspector.inspect(launcher), /version is not approved/u);
    await writeFile(manifestPath, manifest);
    await writeFile(launcher, (await readFile(launcher, "utf8")) + "\n");
    await assert.rejects(inspector.inspect(launcher), /launcher bytes are not approved/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
