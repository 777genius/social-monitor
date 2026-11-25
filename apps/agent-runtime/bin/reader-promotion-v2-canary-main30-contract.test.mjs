import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const artifactPath = join(
  process.cwd(),
  "vendor/vioxen-subscription-runtime-0.1.0-main.30.tgz",
);

test("main.30 exposes every supported API used by the canary lane", async () => {
  const root = await mkdtemp(join(tmpdir(), "reader-promotion-main30-api-"));
  try {
    const extracted = spawnSync("tar", ["-xzf", artifactPath, "-C", root], {
      encoding: "utf8",
    });
    assert.equal(extracted.status, 0, extracted.stderr);
    const packageRoot = join(root, "package");
    const manifest = JSON.parse(
      await readFile(join(packageRoot, "package.json"), "utf8"),
    );
    assert.equal(manifest.version, "0.1.0-main.30");

    const workerDeclaration = await source(
      packageRoot,
      "worker-codex/file-backend-codex-worker.d.ts",
    );
    for (const api of [
      "refreshConflictRetryMaxMs",
      "executionEngine",
      "cleanThreadPrewarm",
      "outputSchemas",
      "runner",
    ]) {
      assert.match(workerDeclaration, new RegExp(`readonly ${api}\\?`, "u"));
    }

    const runtimeFactory = await source(
      packageRoot,
      "worker-codex/file-backend-codex-runtime-factory.js",
    );
    assert.match(
      runtimeFactory,
      /const executionEngine = options\.executionEngine \?\? "app-server"/u,
    );
    assert.match(
      runtimeFactory,
      /executionEngine === "packaged-exec"\s*\? packagedExec/u,
    );
    assert.match(runtimeFactory, /fallback: packagedExec/u);

    const workerIndex = await source(packageRoot, "worker-codex/index.js");
    assert.match(workerIndex, /export \* from "\.\/node-process-runner\.js"/u);

    const worker = await source(
      packageRoot,
      "worker-codex/file-backend-codex-worker.js",
    );
    assert.match(
      worker,
      /this\.options\.refreshConflictRetryMaxMs \?\? 30_000/u,
    );

    const cli = await source(
      packageRoot,
      "worker-local/agent-task-runner/cli.js",
    );
    assert.doesNotMatch(cli, /worker\.prewarm\(/u);
    assert.doesNotMatch(cli, /worker\.resumeManagedRun\(/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const source = (packageRoot, relativePath) =>
  readFile(join(packageRoot, "dist", relativePath), "utf8");
