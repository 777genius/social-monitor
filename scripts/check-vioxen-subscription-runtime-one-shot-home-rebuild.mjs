import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseProvenancePath = join(
  repositoryRoot,
  "vendor/vioxen-subscription-runtime-0.1.0-main.42-sm.2.provenance.json",
);
const expectedArchive = join(
  repositoryRoot,
  "vendor/vioxen-subscription-runtime-0.1.0-main.42-sm.3.tgz",
);
const rebuildScript = join(
  repositoryRoot,
  "scripts/rebuild-vioxen-subscription-runtime-one-shot-home.mjs",
);
const root = await mkdtemp(join(tmpdir(), "sm-one-shot-home-reproducibility-"));

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, COPYFILE_DISABLE: "1" },
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

try {
  const provenance = JSON.parse(await readFile(baseProvenancePath, "utf8"));
  const baseSource = join(repositoryRoot, provenance.baseSource.path);
  assert.equal(await sha256(baseSource), provenance.baseSource.sha256);

  const toolchainSource = join(root, "toolchain-source");
  await mkdir(toolchainSource);
  run("tar", ["-xzf", baseSource, "-C", toolchainSource]);
  run(
    "npm",
    ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"],
    toolchainSource,
  );

  const outputs = [join(root, "rebuild-1.tgz"), join(root, "rebuild-2.tgz")];
  for (const output of outputs) {
    run(process.execPath, [rebuildScript, join(toolchainSource, "node_modules"), output]);
  }

  const expected = await sha256(expectedArchive);
  const rebuilt = await Promise.all(outputs.map(sha256));
  const exportDirectory =
    process.env.SUBSCRIPTION_RUNTIME_REBUILD_EXPORT_DIR?.trim();
  if (exportDirectory) {
    await mkdir(exportDirectory, { recursive: true });
    await Promise.all(
      outputs.map((output, index) =>
        cp(output, join(exportDirectory, `rebuild-${index + 1}.tgz`)),
      ),
    );
  }
  assert.deepEqual(rebuilt, [expected, expected]);
  process.stdout.write(
    `subscription-runtime one-shot archive reproduced twice: ${expected}\n`,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
