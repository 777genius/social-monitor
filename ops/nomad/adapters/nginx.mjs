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

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
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
 * }} options
 */
export function createNginxAdapter({
  includeDir,
  allowedNamespace,
  allowedJob,
  allowedCidr,
  validate = async () => {},
  reload = async () => {},
}) {
  mkdirSync(includeDir, { recursive: true, mode: 0o755 });
  const activePath = join(includeDir, ACTIVE_FILE_NAME);
  const statePath = join(includeDir, STATE_FILE_NAME);

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
        if (previousContent !== null) {
          writeAtomic(activePath, previousContent, 0o644);
        }
        throw new NginxReloadError(`nginx adapter: config validation failed, kept previous route: ${error.message}`, {
          restored: true,
        });
      }

      try {
        await reload();
      } catch (error) {
        if (previousContent !== null) {
          writeAtomic(activePath, previousContent, 0o644);
          let restored = true;
          try {
            await reload();
          } catch {
            restored = false;
          }
          throw new NginxReloadError(`nginx adapter: reload failed after switch, restored previous route: ${error.message}`, {
            restored,
          });
        }
        throw new NginxReloadError(`nginx adapter: reload failed on first publish, no previous route to restore: ${error.message}`, {
          restored: false,
        });
      }

      writeAtomic(
        statePath,
        JSON.stringify({ currentEndpoint: endpoint, configPreimage: rendered }, null, 2),
        0o644,
      );
      return { switched: true, previousEndpoint: state.currentEndpoint ?? null, configPreimage: rendered };
    },

    /**
     * Restores a previously recorded receipt's config verbatim (used on
     * explicit rollback, not on the automatic validate/reload failure path
     * above, which already restores inline).
     */
    async restore(receipt) {
      if (!receipt || typeof receipt.configPreimage !== "string") {
        throw new EndpointNotAllowedError("nginx adapter: restore requires a receipt with configPreimage");
      }
      writeAtomic(activePath, receipt.configPreimage, 0o644);
      await validate(activePath);
      await reload();
      writeAtomic(
        statePath,
        JSON.stringify({ currentEndpoint: receipt.currentEndpoint ?? null, configPreimage: receipt.configPreimage }, null, 2),
        0o644,
      );
      return { restored: true };
    },
  });
}
