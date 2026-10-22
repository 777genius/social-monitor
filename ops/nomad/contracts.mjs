/**
 * Narrow deployment contracts for the Nomad API vertical slice.
 *
 * This module owns only the small value/port shapes described in the MVP
 * plan (release identity, health, traffic switching, rollback evidence). It
 * must never import from `apps/` or `libs/`: deployment code stays isolated
 * from application/domain code (Clean Architecture boundary), and adapters
 * (Nomad, nginx, GitHub, GHCR, filesystem) depend on these contracts, not the
 * other way around (DIP).
 */

const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const IMAGE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const IMAGE_TAG_PATTERN = /^sha-[0-9a-f]{40}$/u;
const REPOSITORY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+$/u;
const REGISTRY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.-]*(?::\d+)?$/u;
// Intentionally not libs/shared-kernel/src/redaction.ts's isSensitiveKey,
// despite covering the same idea: this file's own module contract above
// forbids importing from libs/, and libs/shared-kernel is TypeScript run
// through the app's build - importing it from a plain, buildless .mjs run
// directly by `node --test` would only work by accident of the local Node
// version's TS support (CI pins Node 22, which does not strip types by
// default), matching the same standalone-pattern precedent already used by
// scripts/check-secrets.mjs. This pattern is deliberately narrower in scope
// than shared-kernel's (DeployTarget.hostBinding and HealthResult.reason
// only) - it is not a substitute for the app-wide redaction policy.
const SECRET_LIKE_KEY_PATTERN = /secret|token|password|credential|private[-_]?key/iu;
const HEALTH_STATUSES = new Set(["healthy", "unhealthy", "unknown"]);
const ROLLBACK_OUTCOMES = new Set(["succeeded", "failed", "rolled-back", "unknown"]);
const REQUIRED_TRAFFIC_SWITCH_METHODS = ["inspect", "switch", "restore"];

function fail(contractName, message) {
  throw new TypeError(`ops/nomad/contracts: ${contractName} ${message}`);
}

function requireNonEmptyString(contractName, field, value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(contractName, `requires a non-empty string "${field}"`);
  }
  return value;
}

function requireMatch(contractName, field, value, pattern) {
  requireNonEmptyString(contractName, field, value);
  if (!pattern.test(value)) {
    fail(contractName, `field "${field}" does not match the required format`);
  }
  return value;
}

function requireIsoTimestamp(contractName, field, value) {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    fail(contractName, `requires a valid timestamp for "${field}"`);
  }
  return parsed.toISOString();
}

function requireNoSecretLikeKeys(contractName, field, value) {
  if (value === null || typeof value !== "object") {
    fail(contractName, `requires an object for "${field}"`);
  }
  for (const key of Object.keys(value)) {
    if (SECRET_LIKE_KEY_PATTERN.test(key)) {
      fail(contractName, `field "${field}" must not carry credential-shaped key "${key}"`);
    }
  }
  return value;
}

/**
 * @typedef {object} ImageReference
 * @property {string} registry
 * @property {string} repository
 * @property {string} digest - `sha256:<64 hex>`; the only deployment identity.
 * @property {string} platform - e.g. `linux/amd64`.
 * @property {string|null} tag - optional `sha-<40 hex>` search aid, never identity.
 * @property {string} reference - fully qualified `registry/repository@digest`.
 */

/**
 * @param {{registry: string, repository: string, digest: string, platform: string, tag?: string|null}} fields
 * @returns {ImageReference}
 */
export function createImageReference({ registry, repository, digest, platform, tag = null }) {
  const name = "ImageReference";
  requireMatch(name, "registry", registry, REGISTRY_PATTERN);
  requireMatch(name, "repository", repository, REPOSITORY_PATTERN);
  requireMatch(name, "digest", digest, IMAGE_DIGEST_PATTERN);
  requireNonEmptyString(name, "platform", platform);
  if (tag !== null && tag !== undefined) {
    requireMatch(name, "tag", tag, IMAGE_TAG_PATTERN);
  }
  return Object.freeze({
    registry,
    repository,
    digest,
    platform,
    tag: tag ?? null,
    reference: `${registry}/${repository}@${digest}`,
  });
}

/**
 * @typedef {object} ReleaseManifest
 * @property {string} sourceSha - full 40-hex commit SHA the image was built from.
 * @property {ImageReference} image
 * @property {string} targetConfigHash - hash identifying the rendered deploy target/config.
 * @property {string|null} previousReleaseId - null only for the first release.
 */

/**
 * @param {{sourceSha: string, image: ImageReference, targetConfigHash: string, previousReleaseId?: string|null}} fields
 * @returns {ReleaseManifest}
 */
export function createReleaseManifest({ sourceSha, image, targetConfigHash, previousReleaseId = null }) {
  const name = "ReleaseManifest";
  requireMatch(name, "sourceSha", sourceSha, GIT_SHA_PATTERN);
  requireNonEmptyString(name, "targetConfigHash", targetConfigHash);
  const validatedImage = createImageReference(image ?? {});
  if (previousReleaseId !== null && previousReleaseId !== undefined) {
    requireNonEmptyString(name, "previousReleaseId", previousReleaseId);
  }
  return Object.freeze({
    sourceSha,
    image: validatedImage,
    targetConfigHash,
    previousReleaseId: previousReleaseId ?? null,
  });
}

/**
 * @typedef {object} DeployTarget
 * @property {string} namespace
 * @property {string} jobId
 * @property {{address: string, port: number}} hostBinding - no credentials.
 */

/**
 * @param {{namespace: string, jobId: string, hostBinding: {address: string, port: number}}} fields
 * @returns {DeployTarget}
 */
export function createDeployTarget({ namespace, jobId, hostBinding }) {
  const name = "DeployTarget";
  requireNonEmptyString(name, "namespace", namespace);
  requireNonEmptyString(name, "jobId", jobId);
  requireNoSecretLikeKeys(name, "hostBinding", hostBinding);
  requireNonEmptyString(name, "hostBinding.address", hostBinding.address);
  if (!Number.isInteger(hostBinding.port) || hostBinding.port <= 0 || hostBinding.port > 65535) {
    fail(name, 'requires an integer "hostBinding.port" in the 1-65535 range');
  }
  return Object.freeze({
    namespace,
    jobId,
    hostBinding: Object.freeze({ address: hostBinding.address, port: hostBinding.port }),
  });
}

/**
 * @typedef {object} HealthResult
 * @property {"healthy"|"unhealthy"|"unknown"} status
 * @property {string} checkedAt - ISO 8601 timestamp.
 * @property {string} reason - sanitized, human-readable; never a raw provider payload.
 * @property {string|null} observedAllocation - allocation ID the check ran against, if any.
 */

/**
 * @param {{status: string, checkedAt: string|Date, reason?: string, observedAllocation?: string|null}} fields
 * @returns {HealthResult}
 */
export function createHealthResult({ status, checkedAt, reason = "", observedAllocation = null }) {
  const name = "HealthResult";
  if (!HEALTH_STATUSES.has(status)) {
    fail(name, 'requires "status" to be one of healthy, unhealthy, unknown');
  }
  const isoCheckedAt = requireIsoTimestamp(name, "checkedAt", checkedAt);
  if (typeof reason !== "string") {
    fail(name, 'requires "reason" to be a string');
  }
  if (SECRET_LIKE_KEY_PATTERN.test(reason)) {
    fail(name, 'field "reason" must not reference credential-shaped content');
  }
  if (observedAllocation !== null && observedAllocation !== undefined) {
    requireNonEmptyString(name, "observedAllocation", observedAllocation);
  }
  return Object.freeze({
    status,
    checkedAt: isoCheckedAt,
    reason,
    observedAllocation: observedAllocation ?? null,
  });
}

/**
 * @typedef {object} TrafficSwitch
 * @property {() => Promise<unknown>} inspect
 * @property {(expectedPrevious: unknown, endpoint: unknown) => Promise<unknown>} switch
 * @property {(receipt: unknown) => Promise<unknown>} restore
 */

/**
 * Validates that an adapter satisfies the TrafficSwitch port and returns a
 * facade exposing exactly those three methods (ISP: callers cannot reach
 * adapter-specific internals through this contract).
 * @param {Record<string, unknown>} adapter
 * @returns {TrafficSwitch}
 */
export function createTrafficSwitch(adapter) {
  const name = "TrafficSwitch";
  if (adapter === null || typeof adapter !== "object") {
    fail(name, "requires an adapter object");
  }
  for (const method of REQUIRED_TRAFFIC_SWITCH_METHODS) {
    if (typeof adapter[method] !== "function") {
      fail(name, `requires adapter method "${method}"`);
    }
  }
  return Object.freeze({
    inspect: (...args) => adapter.inspect(...args),
    switch: (...args) => adapter.switch(...args),
    restore: (...args) => adapter.restore(...args),
  });
}

/**
 * @typedef {object} RollbackReceipt
 * @property {string|null} previousReleaseId - null only for the first release.
 * @property {string} newReleaseId
 * @property {string} jobId
 * @property {string} deploymentId
 * @property {string} configPreimage - reference/hash of config restored on rollback.
 * @property {"succeeded"|"failed"|"rolled-back"|"unknown"} outcome
 */

/**
 * @param {{previousReleaseId?: string|null, newReleaseId: string, jobId: string, deploymentId: string, configPreimage: string, outcome: string}} fields
 * @returns {RollbackReceipt}
 */
export function createRollbackReceipt({
  previousReleaseId = null,
  newReleaseId,
  jobId,
  deploymentId,
  configPreimage,
  outcome,
}) {
  const name = "RollbackReceipt";
  if (previousReleaseId !== null && previousReleaseId !== undefined) {
    requireNonEmptyString(name, "previousReleaseId", previousReleaseId);
  }
  requireNonEmptyString(name, "newReleaseId", newReleaseId);
  requireNonEmptyString(name, "jobId", jobId);
  requireNonEmptyString(name, "deploymentId", deploymentId);
  requireNonEmptyString(name, "configPreimage", configPreimage);
  if (!ROLLBACK_OUTCOMES.has(outcome)) {
    fail(name, 'requires "outcome" to be one of succeeded, failed, rolled-back, unknown');
  }
  return Object.freeze({
    previousReleaseId: previousReleaseId ?? null,
    newReleaseId,
    jobId,
    deploymentId,
    configPreimage,
    outcome,
  });
}
