#!/usr/bin/env node
/**
 * nginx traffic adapter for the `sm-api` vertical slice (plan section 4).
 *
 * Native Nomad service discovery is not DNS and does not update nginx by
 * itself, so this adapter is the only bridge: it renders a validated
 * upstream include, atomically publishes it into an **include directory**
 * (never a single mounted file - an atomic rename onto a bind-mounted file
 * can leave the container holding the old inode), runs an injectable
 * validate+reload step, and only then remembers the new endpoint as current.
 * On any validate/reload failure it leaves the previously active file alone
 * and reports failure - it never guesses a "probably fine" fallback.
 *
 * This module satisfies the `TrafficSwitch` port from `../contracts.mjs`
 * (`inspect`/`switch`/`restore`) but is written as a plain adapter object;
 * wrap it with `createTrafficSwitch` from contracts.mjs at the call site
 * (ISP: callers should depend on that narrow port, not on this file).
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export class TrafficSwitchConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "TrafficSwitchConflictError";
  }
}

export class EndpointNotAllowedError extends Error {
  constructor(message) {
    super(message);
    this.name = "EndpointNotAllowedError";
  }
}

export class NginxReloadError extends Error {
  constructor(message, { restored } = {}) {
    super(message);
    this.name = "NginxReloadError";
    this.restored = Boolean(restored);
  }
}

const ACTIVE_FILE_NAME = "api-upstream.conf";
const STATE_FILE_NAME = "api-upstream.state.json";
const LOCK_DIR_NAME = "api-upstream.lock";

/**
 * Cross-process mutex for the read-decide-write sequence in `switch`/
 * `restore`. `release.mjs` (occasional deploys) and reconcile-traffic.mjs's
 * periodic loop (every ~5s, plan section 4) both call this adapter and are
 * not otherwise serialized against each other - without a real lock here,
 * two callers could both read the same "current" state and then both write,
 * corrupting either the served config or the state file's own bookkeeping.
 * `mkdirSync` is used as the atomic primitive (EEXIST is atomic and
 * portable); a crashed holder fails loudly on the next attempt instead of
 * silently racing, matching this repo's fail-closed conventions.
 */
async function acquireLock(lockPath, { timeoutMs = 5000, pollIntervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      mkdirSync(lockPath);
      return;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      if (Date.now() >= deadline) {
        throw new TrafficSwitchConflictError(
          `nginx adapter: could not acquire cross-process lock at ${lockPath} within ${timeoutMs}ms ` +
            "(a concurrent switch/reconcile is in progress, or a prior holder crashed and left it behind)",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}

function releaseLock(lockPath) {
  rmSync(lockPath, { recursive: true, force: true });
}

function ipToInt(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((acc, part) => acc * 256 + part, 0);
}

/**
 * Minimal IPv4 CIDR membership check - no dependency pulled in for one
 * allowlist comparison (plan section 4: only the trusted project subnet may
 * ever become an nginx upstream).
 * @param {string} address
 * @param {string} cidr - e.g. "172.20.0.0/16"
 */
export function isAddressInCidr(address, cidr) {
  const [rangeIp, prefixRaw] = cidr.split("/");
  const prefix = Number(prefixRaw);
  const addressInt = ipToInt(address);
  const rangeInt = ipToInt(rangeIp);
  if (addressInt === null || rangeInt === null || Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (addressInt & mask) === (rangeInt & mask);
}

function renderUpstreamInclude({ address, port }) {
  return `# Managed by ops/nomad/adapters/nginx.mjs. Do not edit by hand.\nupstream social_monitor_api_nomad {\n  server ${address}:${port};\n}\n`;
}

function readState(statePath) {
  if (!existsSync(statePath)) {
    return { currentEndpoint: null, configPreimage: null };
  }
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function writeAtomic(path, content, mode) {
  const tempPath = `${path}.next-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, content, { mode });
  renameSync(tempPath, path);
}

/**
 * @param {{
 *   includeDir: string,
 *   allowedNamespace: string,
 *   allowedJob: string,
 *   allowedCidr: string,
 *   validate?: (path: string) => Promise<void>,
 *   reload?: () => Promise<void>,
 *   lockTimeoutMs?: number,
 *   lockPollIntervalMs?: number,
 * }} options
 */
export function createNginxAdapter({
  includeDir,
  allowedNamespace,
  allowedJob,
  allowedCidr,
  validate = async () => {},
  reload = async () => {},
  lockTimeoutMs = 5000,
  lockPollIntervalMs = 50,
}) {
  mkdirSync(includeDir, { recursive: true, mode: 0o755 });
  const activePath = join(includeDir, ACTIVE_FILE_NAME);
  const statePath = join(includeDir, STATE_FILE_NAME);
  const lockPath = join(includeDir, LOCK_DIR_NAME);
  const withLock = () => acquireLock(lockPath, { timeoutMs: lockTimeoutMs, pollIntervalMs: lockPollIntervalMs });

  /**
   * Restores activePath to whatever it held before the failed attempt
   * (or removes it, on a first-ever publish with nothing to go back to),
   * then tries once to bring nginx's own runtime state back in line with
   * that file via reload(). Shared by every failure branch below
   * (validate, reload, and state-persistence failures in both switch() and
   * restore()) so "roll the config back and report whether nginx actually
   * picked it up" is one reviewable behavior, not three copies of it.
   * @param {string|null} previousContent
   * @returns {Promise<boolean>} whether the rollback reload itself succeeded
   */
  async function rollbackActiveConfig(previousContent) {
    if (previousContent !== null) {
      writeAtomic(activePath, previousContent, 0o644);
    } else {
      rmSync(activePath, { force: true });
    }
    try {
      await reload();
      return true;
    } catch {
      return false;
    }
  }

  function assertAllowedEndpoint(endpoint) {
    if (!endpoint || typeof endpoint !== "object") {
      throw new EndpointNotAllowedError("nginx adapter: endpoint must be an object");
    }
    const { namespace, jobId, address, port } = endpoint;
    if (namespace !== allowedNamespace || jobId !== allowedJob) {
      throw new EndpointNotAllowedError(
        `nginx adapter: endpoint namespace/job "${namespace}/${jobId}" is not the trusted target "${allowedNamespace}/${allowedJob}"`,
      );
    }
    if (!isAddressInCidr(address, allowedCidr)) {
      throw new EndpointNotAllowedError(`nginx adapter: address "${address}" is outside the trusted subnet ${allowedCidr}`);
    }
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new EndpointNotAllowedError(`nginx adapter: invalid port "${port}"`);
    }
  }

  return Object.freeze({
    /** @returns {{currentEndpoint: object|null, configPreimage: string|null}} */
    async inspect() {
      return readState(statePath);
    },

    /**
     * Compare-and-swap traffic switch. `expectedPrevious` must match the
     * adapter's own last-known current endpoint (or `null` on first
     * publish); mismatched callers get a conflict rather than silently
     * clobbering a route someone else already changed.
     */
    async switch(expectedPrevious, endpoint) {
      await withLock();
      try {
        const state = readState(statePath);
        const expectedKey = JSON.stringify(expectedPrevious ?? null);
        const actualKey = JSON.stringify(state.currentEndpoint ?? null);
        if (expectedKey !== actualKey) {
          throw new TrafficSwitchConflictError(
            "nginx adapter: expectedPrevious does not match the current route (concurrent switch?)",
          );
        }
        assertAllowedEndpoint(endpoint);

        const rendered = renderUpstreamInclude(endpoint);
        const previousContent = existsSync(activePath) ? readFileSync(activePath, "utf8") : null;

        writeAtomic(activePath, rendered, 0o644);
        try {
          await validate(activePath);
        } catch (error) {
          const restored = await rollbackActiveConfig(previousContent);
          throw new NginxReloadError(`nginx adapter: config validation failed, kept previous route: ${error.message}`, {
            restored,
          });
        }

        try {
          await reload();
        } catch (error) {
          const restored = await rollbackActiveConfig(previousContent);
          throw new NginxReloadError(`nginx adapter: reload failed after switch, restored previous route: ${error.message}`, {
            restored,
          });
        }

        try {
          writeAtomic(
            statePath,
            JSON.stringify({ currentEndpoint: endpoint, configPreimage: rendered }, null, 2),
            0o644,
          );
        } catch (error) {
          // nginx has already reloaded to serve `endpoint`, but recording
          // that durably just failed (disk full, permissions): leaving this
          // half-applied - config live, bookkeeping stale - would let the
          // next switch()'s CAS check trust the wrong "current" value. Roll
          // the live config back too so both agree again, rather than
          // leaving a call that "half-succeeded" behind.
          const restored = await rollbackActiveConfig(previousContent);
          throw new NginxReloadError(
            `nginx adapter: failed to persist switch state, rolled config back: ${error.message}`,
            { restored },
          );
        }
        return { switched: true, previousEndpoint: state.currentEndpoint ?? null, configPreimage: rendered };
      } finally {
        releaseLock(lockPath);
      }
    },

    /**
     * @typedef {object} NginxRestoreToken
     * @property {string} configPreimage - exact file content a prior `switch()` rendered, not a `contracts.mjs` RollbackReceipt's opaque reference/hash.
     * @property {{namespace: string, jobId: string, address: string, port: number}|null} currentEndpoint - the endpoint that configPreimage actually serves, so `inspect()` stays accurate after this restore.
     */
    /**
     * Restores a previously recorded config verbatim (used on an explicit,
     * operator-triggered rollback, not on the automatic validate/reload
     * failure path above, which already restores inline).
     *
     * Takes an `NginxRestoreToken`, deliberately not a bare `contracts.mjs`
     * RollbackReceipt: RollbackReceipt has no `currentEndpoint` field at
     * all, and its `configPreimage` is documented as an opaque
     * reference/hash, not literal file content. Passing a RollbackReceipt
     * here directly would silently record `currentEndpoint: null`
     * regardless of what was actually restored. Build the token from
     * whichever store durably holds the real content+endpoint pair (e.g.
     * this adapter's own prior successful `switch()` result) before calling
     * this.
     * @param {NginxRestoreToken} token
     */
    async restore(token) {
      if (!token || typeof token.configPreimage !== "string") {
        throw new EndpointNotAllowedError("nginx adapter: restore requires a token with configPreimage");
      }
      await withLock();
      try {
        const previousContent = existsSync(activePath) ? readFileSync(activePath, "utf8") : null;
        writeAtomic(activePath, token.configPreimage, 0o644);
        try {
          await validate(activePath);
          await reload();
        } catch (error) {
          // An explicit rollback that itself fails must not leave the
          // active config in an unreviewed, unreloaded state - restore
          // whatever was actually running before this call, same as
          // switch()'s own failure handling.
          const restored = await rollbackActiveConfig(previousContent);
          throw new NginxReloadError(`nginx adapter: restore failed, rolled back to the prior config: ${error.message}`, {
            restored,
          });
        }

        try {
          writeAtomic(
            statePath,
            JSON.stringify({ currentEndpoint: token.currentEndpoint ?? null, configPreimage: token.configPreimage }, null, 2),
            0o644,
          );
        } catch (error) {
          const restored = await rollbackActiveConfig(previousContent);
          throw new NginxReloadError(
            `nginx adapter: failed to persist restore state, rolled config back: ${error.message}`,
            { restored },
          );
        }
        return { restored: true };
      } finally {
        releaseLock(lockPath);
      }
    },
  });
}
