import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { readApiOwner, writeApiOwner, apiOwnerMarkerPath, resolveDeployStateRoot } from "./ownership.mjs";

function withTempDeployState(run) {
  const deployState = mkdtempSync(join(tmpdir(), "sm-nomad-ownership-test-"));
  try {
    return run(deployState);
  } finally {
    rmSync(deployState, { recursive: true, force: true });
  }
}

test("readApiOwner defaults to compose when the marker is absent", () => {
  withTempDeployState((deployState) => {
    assert.equal(readApiOwner({ deployState }), "compose");
  });
});

test("writeApiOwner then readApiOwner round-trips nomad", () => {
  withTempDeployState((deployState) => {
    writeApiOwner("nomad", { deployState });
    assert.equal(readApiOwner({ deployState }), "nomad");
  });
});

test("writeApiOwner then readApiOwner round-trips compose after nomad", () => {
  withTempDeployState((deployState) => {
    writeApiOwner("nomad", { deployState });
    writeApiOwner("compose", { deployState });
    assert.equal(readApiOwner({ deployState }), "compose");
  });
});

test("writeApiOwner rejects an invalid owner value and leaves no marker", () => {
  withTempDeployState((deployState) => {
    assert.throws(() => writeApiOwner("docker", { deployState }), TypeError);
    assert.equal(readApiOwner({ deployState }), "compose");
  });
});

test("readApiOwner rejects a corrupt marker instead of defaulting silently", () => {
  withTempDeployState((deployState) => {
    writeApiOwner("nomad", { deployState });
    writeFileSync(apiOwnerMarkerPath({ deployState }), "not-an-owner\n");
    assert.throws(() => readApiOwner({ deployState }), TypeError);
  });
});

test("writeApiOwner does not leave a stray temp file behind on success", () => {
  withTempDeployState((deployState) => {
    writeApiOwner("nomad", { deployState });
    const markerDir = join(deployState, "nomad");
    const entries = readdirSync(markerDir);
    assert.deepEqual(entries, ["api-owner"]);
  });
});

test("resolveDeployStateRoot falls back to the production default", () => {
  const previous = process.env.SOCIAL_MONITOR_DEPLOY_STATE;
  delete process.env.SOCIAL_MONITOR_DEPLOY_STATE;
  try {
    assert.equal(resolveDeployStateRoot(), "/var/data/social-monitor/control/deploy-state");
  } finally {
    if (previous !== undefined) process.env.SOCIAL_MONITOR_DEPLOY_STATE = previous;
  }
});

test("resolveDeployStateRoot prefers an explicit option over the environment", () => {
  const previous = process.env.SOCIAL_MONITOR_DEPLOY_STATE;
  process.env.SOCIAL_MONITOR_DEPLOY_STATE = "/tmp/should-not-be-used";
  try {
    assert.equal(resolveDeployStateRoot({ deployState: "/tmp/explicit" }), "/tmp/explicit");
  } finally {
    if (previous === undefined) delete process.env.SOCIAL_MONITOR_DEPLOY_STATE;
    else process.env.SOCIAL_MONITOR_DEPLOY_STATE = previous;
  }
});
