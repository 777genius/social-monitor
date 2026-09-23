import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeployTarget,
  createHealthResult,
  createImageReference,
  createReleaseManifest,
  createRollbackReceipt,
  createTrafficSwitch,
} from "./contracts.mjs";

const VALID_SHA = "a".repeat(40);
const VALID_DIGEST = `sha256:${"b".repeat(64)}`;

function validImage(overrides = {}) {
  return {
    registry: "ghcr.io",
    repository: "777genius/social-monitor-api",
    digest: VALID_DIGEST,
    platform: "linux/amd64",
    ...overrides,
  };
}

test("ImageReference accepts a valid digest reference and rejects a tag as identity", () => {
  const image = createImageReference(validImage({ tag: `sha-${VALID_SHA}` }));
  assert.equal(image.reference, `ghcr.io/777genius/social-monitor-api@${VALID_DIGEST}`);
  assert.equal(image.tag, `sha-${VALID_SHA}`);
  assert.throws(() => createImageReference(validImage({ digest: "latest" })), TypeError);
  assert.throws(() => createImageReference(validImage({ repository: "UPPERCASE" })), TypeError);
  assert.throws(() => createImageReference(validImage({ tag: "v1.0.0" })), TypeError);
});

test("ImageReference rejects missing required fields", () => {
  assert.throws(() => createImageReference(validImage({ registry: "" })), TypeError);
  assert.throws(() => createImageReference(validImage({ platform: undefined })), TypeError);
});

test("ImageReference is immutable", () => {
  const image = createImageReference(validImage());
  assert.throws(() => {
    image.digest = "sha256:" + "0".repeat(64);
  });
});

test("ReleaseManifest requires a full 40-hex source SHA and a valid image", () => {
  const manifest = createReleaseManifest({
    sourceSha: VALID_SHA,
    image: validImage(),
    targetConfigHash: "config-hash-1",
  });
  assert.equal(manifest.sourceSha, VALID_SHA);
  assert.equal(manifest.previousReleaseId, null);
  assert.throws(
    () =>
      createReleaseManifest({
        sourceSha: "short-sha",
        image: validImage(),
        targetConfigHash: "config-hash-1",
      }),
    TypeError,
  );
  assert.throws(
    () =>
      createReleaseManifest({
        sourceSha: VALID_SHA,
        image: validImage({ digest: "not-a-digest" }),
        targetConfigHash: "config-hash-1",
      }),
    TypeError,
  );
});

test("ReleaseManifest carries an explicit previous release id when supplied", () => {
  const manifest = createReleaseManifest({
    sourceSha: VALID_SHA,
    image: validImage(),
    targetConfigHash: "config-hash-1",
    previousReleaseId: "release-0",
  });
  assert.equal(manifest.previousReleaseId, "release-0");
});

test("DeployTarget rejects credential-shaped keys on hostBinding", () => {
  assert.throws(
    () =>
      createDeployTarget({
        namespace: "social-monitor",
        jobId: "sm-api",
        hostBinding: { address: "10.0.0.5", port: 3000, apiToken: "x" },
      }),
    TypeError,
  );
});

test("DeployTarget accepts a bounded host binding without credentials", () => {
  const target = createDeployTarget({
    namespace: "social-monitor",
    jobId: "sm-api",
    hostBinding: { address: "10.0.0.5", port: 3000 },
  });
  assert.deepEqual(target.hostBinding, { address: "10.0.0.5", port: 3000 });
});

test("DeployTarget rejects an out-of-range port", () => {
  assert.throws(
    () =>
      createDeployTarget({
        namespace: "social-monitor",
        jobId: "sm-api",
        hostBinding: { address: "10.0.0.5", port: 70000 },
      }),
    TypeError,
  );
});

test("HealthResult normalizes timestamps and rejects unknown status values", () => {
  const checkedAt = new Date("2026-09-11T00:00:00.000Z");
  const result = createHealthResult({ status: "healthy", checkedAt, observedAllocation: "alloc-1" });
  assert.equal(result.checkedAt, "2026-09-11T00:00:00.000Z");
  assert.equal(result.reason, "");
  assert.throws(() => createHealthResult({ status: "degraded", checkedAt }), TypeError);
  assert.throws(() => createHealthResult({ status: "healthy", checkedAt: "not-a-date" }), TypeError);
});

test("HealthResult rejects a reason that looks like a leaked credential", () => {
  assert.throws(
    () =>
      createHealthResult({
        status: "unhealthy",
        checkedAt: new Date(),
        reason: "db password=hunter2 rejected",
      }),
    TypeError,
  );
});

test("TrafficSwitch requires inspect/switch/restore and exposes only those methods", () => {
  const calls = [];
  const adapter = {
    inspect: async () => "current",
    switch: async (expectedPrevious, endpoint) => calls.push(["switch", expectedPrevious, endpoint]),
    restore: async (receipt) => calls.push(["restore", receipt]),
    dangerousInternal: () => "should not be reachable",
  };
  const port = createTrafficSwitch(adapter);
  assert.deepEqual(Object.keys(port).sort(), ["inspect", "restore", "switch"]);
  assert.equal(typeof port.dangerousInternal, "undefined");
});

test("TrafficSwitch rejects an adapter missing a required method", () => {
  assert.throws(
    () =>
      createTrafficSwitch({
        inspect: async () => "current",
        switch: async () => {},
      }),
    TypeError,
  );
});

test("RollbackReceipt requires a known outcome and non-empty identifiers", () => {
  const receipt = createRollbackReceipt({
    newReleaseId: "release-1",
    jobId: "sm-api",
    deploymentId: "deploy-1",
    configPreimage: "config-hash-0",
    outcome: "rolled-back",
  });
  assert.equal(receipt.previousReleaseId, null);
  assert.throws(
    () =>
      createRollbackReceipt({
        newReleaseId: "release-1",
        jobId: "sm-api",
        deploymentId: "deploy-1",
        configPreimage: "config-hash-0",
        outcome: "maybe",
      }),
    TypeError,
  );
});
