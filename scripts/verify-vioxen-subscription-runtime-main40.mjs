import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = join(
  projectRoot,
  "vendor/vioxen-subscription-runtime-0.1.0-main.40.tgz",
);
const provenancePath = join(
  projectRoot,
  "vendor/vioxen-subscription-runtime-0.1.0-main.40.provenance.json",
);
const tempRoot = await mkdtemp(
  join(tmpdir(), "social-monitor-subscription-runtime-main40-"),
);

try {
  const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
  assert.equal(provenance.sourceCommit, "2d53ea63a54769567c6ac64e8658363ead638b43");
  assert.equal(provenance.gitCheckout, false);
  assert.equal(provenance.archiveSha256, "2422ac0ffe453f4e7a98e2016c96d72961963e1d644ccf213b1d12b7290fe560");
  const artifactBytes = await readFile(artifactPath);
  assert.equal(
    createHash("sha256").update(artifactBytes).digest("hex"),
    provenance.sha256,
    "subscription-runtime artifact sha256 mismatch",
  );
  run("tar", ["-xzf", artifactPath, "-C", tempRoot]);
  const packageRoot = join(tempRoot, "package");
  const manifest = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  );
  assert.equal(manifest.name, "@vioxen/subscription-runtime");
  assert.equal(manifest.version, provenance.packageVersion);
  assert.deepEqual(manifest.bundledDependencies, [
    "@vioxen/agent-account-observability",
  ]);
  assert.equal(provenance.packagingProfile, "thin-bundle-agent-account-observability-v1");

  const launcherPath = join(
    packageRoot,
    "dist/worker-local/agent-task-runner-cli.js",
  );
  const launcherBytes = await readFile(launcherPath);
  assert.equal(
    createHash("sha256").update(launcherBytes).digest("hex"),
    provenance.launcherSha256,
    "subscription-runtime launcher sha256 mismatch",
  );

  const client = await readFile(
    join(
      packageRoot,
      "dist/provider-codex/app-server/application/app-server-client.js",
    ),
    "utf8",
  );
  assert.match(client, /account\/rateLimits\/read/u);
  assert.match(client, /account\/rateLimits\/updated/u);
  await readFile(
    join(
      packageRoot,
      "dist/provider-codex/app-server/application/app-server-rate-limits-monitor.js",
    ),
  );
  await readFile(
    join(
      packageRoot,
      "dist/worker-codex/application/codex-live-quota-capacity.js",
    ),
  );

  assert.match(client, /thread\/tokenUsage\/updated/u);

  const archiveEntries = run("tar", ["-tzf", artifactPath]).stdout
    .split("\n")
    .filter((entry) => entry.startsWith("package/node_modules/") && entry);
  assert.equal(archiveEntries.length > 0, true);
  assert.equal(
    archiveEntries.every((entry) =>
      entry.startsWith(
        "package/node_modules/@vioxen/agent-account-observability/",
      )),
    true,
    "thin vendor artifact contains an unexpected bundled dependency",
  );
  process.stdout.write(
    `subscription-runtime ${manifest.version} vendor artifact verified from ${provenance.sourceCommit}\n`,
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status ?? "signal"}): ${result.stderr.trim()}`,
    );
  }
  return result;
}
