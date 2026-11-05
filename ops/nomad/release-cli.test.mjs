import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadReleasePlan } from "./release.mjs";

const RELEASE_CLI = fileURLToPath(new URL("./release.mjs", import.meta.url));
const VALID_SHA = "b".repeat(40);
const VALID_DIGEST = `sha256:${"d".repeat(64)}`;

function withManifestFile(content, run) {
  const dir = mkdtempSync(join(tmpdir(), "sm-release-manifest-"));
  const manifestPath = join(dir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(content));
  try {
    return run(manifestPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function validManifestContent(overrides = {}) {
  return {
    sourceSha: VALID_SHA,
    image: {
      registry: "ghcr.io",
      repository: "777genius/social-monitor-api",
      digest: VALID_DIGEST,
      platform: "linux/amd64",
    },
    targetConfigHash: "hash-1",
    previousReleaseId: null,
    target: { namespace: "social-monitor", jobId: "sm-api", hostBinding: { address: "127.0.0.1", port: 4646 } },
    jobHcl: "job \"sm-api\" {}",
    ...overrides,
  };
}

test("loadReleasePlan validates the manifest through the existing contracts", () => {
  withManifestFile(validManifestContent(), (manifestPath) => {
    const plan = loadReleasePlan(manifestPath);
    assert.equal(plan.manifest.sourceSha, VALID_SHA);
    assert.equal(plan.target.jobId, "sm-api");
    assert.equal(plan.jobHcl, "job \"sm-api\" {}");
  });
});

test("loadReleasePlan rejects a manifest missing a rendered jobHcl", () => {
  withManifestFile(validManifestContent({ jobHcl: "" }), (manifestPath) => {
    assert.throws(() => loadReleasePlan(manifestPath), TypeError);
  });
});

test("loadReleasePlan rejects an invalid image digest via the ImageReference contract", () => {
  withManifestFile(
    validManifestContent({ image: { registry: "ghcr.io", repository: "x/y", digest: "latest", platform: "linux/amd64" } }),
    (manifestPath) => {
      assert.throws(() => loadReleasePlan(manifestPath), TypeError);
    },
  );
});

test("CLI --dry-run prints the planned action and exits 0 without touching the network", () => {
  withManifestFile(validManifestContent(), (manifestPath) => {
    const output = execFileSync("node", [RELEASE_CLI, "--dry-run", "--manifest", manifestPath], { encoding: "utf8" });
    assert.match(output, /release dry-run: would submit sm-api/);
    assert.match(output, /compose-fallback/);
  });
});

test("CLI --apply refuses with a clear, non-zero exit instead of silently doing nothing", () => {
  withManifestFile(validManifestContent(), (manifestPath) => {
    assert.throws(() => execFileSync("node", [RELEASE_CLI, "--apply", "--manifest", manifestPath], { encoding: "utf8" }));
  });
});

test("CLI with no arguments prints usage and exits non-zero", () => {
  assert.throws(() => execFileSync("node", [RELEASE_CLI], { encoding: "utf8" }));
});
