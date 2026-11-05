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
  "vendor/vioxen-subscription-runtime-0.1.0-main.41.tgz",
);
const provenancePath = join(
  projectRoot,
  "vendor/vioxen-subscription-runtime-0.1.0-main.41.provenance.json",
);
const tempRoot = await mkdtemp(
  join(tmpdir(), "social-monitor-subscription-runtime-main41-"),
);

try {
  const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
  assert.equal(provenance.sourceCommit, "42ea16961987f8a626a5219b030a5029f28bcdfd");
  assert.equal(provenance.sourcePullRequest, 165);
  assert.equal(provenance.gitCheckout, false);
  assert.equal(provenance.archiveSha256, "5f01f69e8b2bd0e8b0d9e76c24f8e6f34eb59a3e020284a2bdb9743f713611c8");
  // Upstream never bumped its manifest for this commit, so the vendor version is
  // a local successor to main.40. Both numbers stay recorded so the artifact can
  // still be traced back to the exact upstream commit it was packed from.
  assert.equal(provenance.upstreamPackageVersion, "0.1.0-main.40");
  assert.equal(provenance.packageVersionIsLocal, true);
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

  // The P0 this artifact exists to close: turn usage must come from the exact
  // per-update `.last` snapshot, and a malformed snapshot must poison the turn
  // instead of silently falling back to the cumulative counter.
  const usageDomain = await readFile(
    join(
      packageRoot,
      "dist/provider-codex/app-server/domain/app-server-usage.js",
    ),
    "utf8",
  );
  assert.match(
    usageDomain,
    /export function readExactTurnUsage/u,
    "vendored artifact predates the exact per-turn usage reader",
  );

  for (const relativePath of [
    "dist/provider-codex/app-server/application/app-server-turn-usage.js",
    "dist/provider-codex/app-server/application/app-server-turn-state.js",
    "dist/provider-codex/app-server/application/app-server-goal-runner.js",
  ]) {
    const source = await readFile(join(packageRoot, relativePath), "utf8");
    assert.match(
      source,
      /usagePoisoned/u,
      `${relativePath} does not carry fail-closed usage poisoning`,
    );
  }

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
