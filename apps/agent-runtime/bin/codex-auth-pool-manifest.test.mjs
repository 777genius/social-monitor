import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CODEX_AUTH_POOL_MANIFEST_ENV,
  CODEX_AUTH_POOL_ROOT_ENV,
  loadCodexAuthPoolFromEnv,
} from "./codex-auth-pool-manifest.mjs";

test("loads an immutable versioned Codex auth pool", async () => {
  const fixture = await createFixture();
  try {
    const pool = await loadCodexAuthPoolFromEnv(fixture.env);
    assert.equal(pool.snapshotId, "snapshot-1");
    assert.deepEqual(
      pool.accounts.map((account) => account.id),
      ["account-a", "account-b"],
    );
  } finally {
    await fixture.cleanup();
  }
});

test("rejects traversal and group-writable snapshots", async () => {
  const fixture = await createFixture();
  try {
    await fixture.writeManifest({
      schemaVersion: 1,
      snapshotId: "snapshot-1",
      accounts: [{ id: "account-a", relativePath: "../auth.json" }],
    });
    await assert.rejects(
      loadCodexAuthPoolFromEnv(fixture.env),
      /traversal|inside the configured pool root/,
    );
    await fixture.writeManifest(fixture.manifest);
    await chmod(fixture.authPaths[0], 0o620);
    await assert.rejects(
      loadCodexAuthPoolFromEnv(fixture.env),
      /group- or world-writable/,
    );
  } finally {
    await fixture.cleanup();
  }
});

test("requires both pool environment values", async () => {
  await assert.rejects(
    loadCodexAuthPoolFromEnv({
      [CODEX_AUTH_POOL_ROOT_ENV]: "/not-used",
    }),
    /must be configured together/,
  );
});

async function createFixture() {
  const parentDir = await mkdtemp(join(tmpdir(), "codex-auth-pool-test-"));
  const rootDir = join(parentDir, "pool");
  const snapshotDir = join(rootDir, "snapshots", "snapshot-1");
  const manifestPath = join(rootDir, "current.json");
  await mkdir(snapshotDir, { recursive: true, mode: 0o700 });
  const authPaths = ["account-a", "account-b"].map((account) =>
    join(snapshotDir, account, "auth.json"),
  );
  for (const [index, path] of authPaths.entries()) {
    await mkdir(join(snapshotDir, `account-${index === 0 ? "a" : "b"}`), {
      mode: 0o700,
    });
    await writeFile(path, `{"fake":"${index}"}\n`, { mode: 0o400 });
  }
  const manifest = {
    schemaVersion: 1,
    snapshotId: "snapshot-1",
    accounts: ["account-a", "account-b"].map((id) => ({
      id,
      relativePath: `snapshots/snapshot-1/${id}/auth.json`,
    })),
  };
  const writeManifest = async (value) => {
    await chmod(manifestPath, 0o600).catch(() => {});
    await writeFile(manifestPath, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    await chmod(manifestPath, 0o400);
  };
  await writeManifest(manifest);
  return {
    authPaths,
    manifest,
    env: {
      [CODEX_AUTH_POOL_ROOT_ENV]: rootDir,
      [CODEX_AUTH_POOL_MANIFEST_ENV]: "current.json",
    },
    writeManifest,
    cleanup: () => rm(parentDir, { recursive: true, force: true }),
  };
}
