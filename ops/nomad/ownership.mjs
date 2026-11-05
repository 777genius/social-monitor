#!/usr/bin/env node
/**
 * Durable owner marker for the API service: `compose` (legacy Docker Compose,
 * the only value ever set in production by this PR) or `nomad` (later PR
 * activation). This module owns only reading/writing/validating the marker
 * itself (SRP) - it never decides whether switching owner is safe, and it
 * never touches Docker/Nomad/nginx.
 *
 * Marker path mirrors the existing durable `deploy-state` convention used by
 * `ops/deploy/social-monitor-production-deploy.sh` (`$CONTROL/deploy-state`):
 * `<deployState>/nomad/api-owner`. Absence of the marker means `compose`,
 * since production never wrote one before this PR existed.
 *
 * NOT a lock: this file has no fencing token, TTL, or compare-and-swap, so a
 * read-decide-act sequence across two callers is not fenced against a
 * concurrent writer. See ops/nomad/README.md gap 8 for why that is still
 * safe today and what has to land before it stops being safe.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const API_OWNERS = Object.freeze(["compose", "nomad"]);
export const DEFAULT_API_OWNER = "compose";

/**
 * @param {{deployState?: string}} [options]
 * @returns {string} absolute path to the durable deploy-state directory.
 */
export function resolveDeployStateRoot(options = {}) {
  const deployState = options.deployState ?? process.env.SOCIAL_MONITOR_DEPLOY_STATE;
  if (typeof deployState === "string" && deployState.trim().length > 0) {
    return deployState;
  }
  return "/var/data/social-monitor/control/deploy-state";
}

/**
 * @param {{deployState?: string}} [options]
 * @returns {string} absolute path to the API owner marker file.
 */
export function apiOwnerMarkerPath(options = {}) {
  return join(resolveDeployStateRoot(options), "nomad", "api-owner");
}

function assertValidOwner(owner) {
  if (!API_OWNERS.includes(owner)) {
    throw new TypeError(`ops/nomad/ownership: owner must be one of ${API_OWNERS.join(", ")}, got ${JSON.stringify(owner)}`);
  }
}

/**
 * @param {{deployState?: string}} [options]
 * @returns {"compose"|"nomad"}
 */
export function readApiOwner(options = {}) {
  const markerPath = apiOwnerMarkerPath(options);
  let raw;
  try {
    raw = readFileSync(markerPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return DEFAULT_API_OWNER;
    }
    throw error;
  }
  const owner = raw.trim();
  assertValidOwner(owner);
  return owner;
}

/**
 * Atomically writes the marker: write to a sibling temp file, then rename
 * over the destination, so a crash mid-write never leaves a partial marker
 * that a subsequent read could misinterpret.
 * @param {"compose"|"nomad"} owner
 * @param {{deployState?: string}} [options]
 */
export function writeApiOwner(owner, options = {}) {
  assertValidOwner(owner);
  const markerPath = apiOwnerMarkerPath(options);
  const markerDir = join(resolveDeployStateRoot(options), "nomad");
  mkdirSync(markerDir, { recursive: true, mode: 0o755 });
  const tempPath = `${markerPath}.next-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, `${owner}\n`, { mode: 0o644 });
  try {
    renameSync(tempPath, markerPath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup; the original rename error is what matters.
    }
    throw error;
  }
}

function runCli(argv) {
  const [command, value] = argv;
  if (command === "get-owner") {
    process.stdout.write(`${readApiOwner()}\n`);
    return 0;
  }
  if (command === "set-owner") {
    if (!value) {
      process.stderr.write("ownership: set-owner requires an owner value\n");
      return 64;
    }
    writeApiOwner(value);
    return 0;
  }
  process.stderr.write("ownership: usage: ownership.mjs get-owner|set-owner <compose|nomad>\n");
  return 64;
}

const isMainModule = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`ownership: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
