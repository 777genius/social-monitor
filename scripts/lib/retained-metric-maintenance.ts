import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import type { MetricImplementation } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-operation.contracts";
import { refreshSourceSha256 } from "./reader-summary-new-input-refresh-files";

export const metricMaintenanceLocks = [
  [7, "/var/data/social-monitor/control/production-deploy.lock"],
  [9, "/var/data/social-monitor/control/daily-run-singleton.lock"],
  [8, "/var/data/social-monitor/control/daily-run.lock"],
] as const;
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
export function metricExecutableIdentity() {
  return { sourceSha: refreshSourceSha256(), executableSha: sha(readFileSync(process.execPath)) };
}
// Contract already used by reader-summary-recovery-maintenance-lib.sh:
// deployment exclusion (7), daily singleton (9), PostgreSQL admission (8).
// A descriptor inherited from the wrapper INSIDE the container proves a live holder. It does
// not prove old bypassing invocations were retired; that remains parent evidence.
export function assertMetricMaintenanceLocks(testPaths?: readonly (readonly [number, string])[]) {
  if (testPaths && process.env.NODE_ENV !== "test") throw new Error("Test maintenance paths unavailable");
  const proof = (testPaths ?? metricMaintenanceLocks).map(([fd, path]) => {
    if (realpathSync(path) !== path) throw new Error("Maintenance lock path is not canonical");
    const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const named = fstatSync(descriptor), held = fstatSync(fd);
      const current = lstatSync(path);
      if (!named.isFile() || named.nlink !== 1 || (testPaths ? named.uid !== process.geteuid?.() : named.uid !== 0 || (named.mode & 0o7777) !== 0o644) || (named.mode & 0o022) !== 0 ||
          named.dev !== held.dev || named.ino !== held.ino || current.dev !== held.dev || current.ino !== held.ino ||
          current.mode !== named.mode || current.uid !== named.uid || current.nlink !== 1 ||
          !/lock:\s+\d+: FLOCK\s+ADVISORY\s+WRITE/u.test(readFileSync(`/proc/self/fdinfo/${fd}`, "utf8"))) throw new Error("Required existing maintenance lock is not held");
      return { fd, path, device: String(held.dev), inode: String(held.ino) };
    } finally { closeSync(descriptor); }
  });
  const stat = readFileSync("/proc/self/stat", "utf8");
  return { pid: process.pid, startTicks: stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19], locks: proof };
}
export function metricMaintenanceAdmission(sourceSha: string | undefined, executableSha: string | undefined, legacyRetirementRef: string | undefined) {
  if (!sourceSha || !executableSha || !legacyRetirementRef || !/^[A-Za-z0-9][A-Za-z0-9:/_.-]{0,255}$/u.test(legacyRetirementRef)) throw new Error("Reviewed source/executable hashes and parent legacy-retirement evidence reference required");
  const actual = metricExecutableIdentity();
  if (actual.sourceSha !== sourceSha || actual.executableSha !== executableSha) throw new Error("Reviewed metric executable/source mismatch");
  const holder = assertMetricMaintenanceLocks();
  const implementation: MetricImplementation = { ...actual, legacyRetirementRef, holderProof: sha(JSON.stringify(holder)) };
  return { implementation, holder, assertHeld: () => {
    if (sha(JSON.stringify(assertMetricMaintenanceLocks())) !== implementation.holderProof) throw new Error("Maintenance holder changed");
  } };
}
