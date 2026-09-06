import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, openSync, opendirSync, readFileSync, readSync, writeFileSync, writeSync, type BigIntStats } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { openSecureRecoveryEvidenceDirectory } from "./reader-summary-recovery-evidence-secure-file";
import { metricRefreshEvidencePath } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-admission";

const maxBytes = 16 * 1024 * 1024;
const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
const bytesSha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const same = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino && a.uid === b.uid && a.mode === b.mode && a.nlink === b.nlink && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
const code = (e: unknown) => typeof e === "object" && e !== null && "code" in e ? e.code : undefined;
function requireValid(ok: unknown): asserts ok { if (!ok) throw new Error("Unsafe or changed metric evidence filesystem"); }
export type MetricJournalCheckpoint = (point: string, name: string) => void;

// The only test override changes the root/uid, never safety rules or locking.
export class RetainedMetricJournal {
  private readonly directory;
  private lock: number | undefined;
  private lockStamp: BigIntStats | undefined;
  private readonly seen = new Map<string, BigIntStats>();
  private closed = false;
  constructor(private readonly maintenance: () => void, testRoot?: string, private readonly checkpoint?: MetricJournalCheckpoint) {
    maintenance();
    this.directory = openSecureRecoveryEvidenceDirectory(metricRefreshEvidencePath, testRoot);
    try {
      try {
        const fd = openSync(this.path("operation.lock"), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o400);
        try { fchmodSync(fd, 0o400); fsyncSync(fd); fsyncSync(this.directory.descriptor); } finally { closeSync(fd); }
      } catch (e) { if (code(e) !== "EEXIST") throw e; }
      this.lock = openSync(this.path("operation.lock"), flags);
      this.lockStamp = this.stat(this.lock);
      requireValid(this.lockStamp.size === 0n);
      const acquired = spawnSync("/usr/bin/flock", ["--exclusive", "--nonblock", "3"], { stdio: ["ignore", "ignore", "pipe", this.lock], timeout: 5000 });
      if (acquired.error || acquired.status !== 0) throw new Error("Metric operation fence busy or unavailable");
      this.assertHeld();
      fsyncSync(this.lock); fsyncSync(this.directory.descriptor);
    } catch (e) { this.close(); throw e; }
  }
  private path(name: string) { return `/proc/self/fd/${this.directory.descriptor}/${name}`; }
  private name(path: string) {
    const prefix = `${metricRefreshEvidencePath}/`;
    requireValid(path.startsWith(prefix));
    const name = path.slice(prefix.length);
    requireValid(/^(?:operation\.json|proposal-[a-f0-9]{64}\.json|amendment-00000[1-8]\.json|batch-(?:0|[1-9]\d{0,4})\.(?:reserved|observed)\.json|result-[a-f0-9-]{36}\.json|final\.json)$/u.test(name));
    return name;
  }
  private stat(fd: number) {
    const stat = fstatSync(fd, { bigint: true });
    requireValid(stat.isFile() && stat.uid === BigInt(this.directory.effectiveUserId) && (stat.mode & 0o7777n) === 0o400n && stat.nlink === 1n && stat.size <= BigInt(maxBytes));
    return stat;
  }
  assertHeld = () => {
    requireValid(!this.closed && this.lock !== undefined && this.lockStamp !== undefined);
    this.maintenance();
    this.directory.assertNamed();
    const probe = openSync(this.path("operation.lock"), flags);
    try { requireValid(same(this.lockStamp, this.stat(probe)) && same(this.lockStamp, this.stat(this.lock))); } finally { closeSync(probe); }
    requireValid(/lock:\s+\d+: FLOCK\s+ADVISORY\s+WRITE/u.test(readFileSync(`/proc/self/fdinfo/${this.lock}`, "utf8")));
  };
  read(path: string): Buffer | null {
    const name = this.name(path);
    this.assertHeld();
    let fd: number;
    try { fd = openSync(this.path(name), flags); }
    catch (e) {
      this.assertHeld();
      if (code(e) === "ENOENT" && !this.seen.has(name)) return null;
      throw e;
    }
    try {
      const before = this.stat(fd), previous = this.seen.get(name);
      requireValid(!previous || same(previous, before));
      this.checkpoint?.("file_opened", name);
      const buffer = Buffer.alloc(Number(before.size) + 1);
      let length = 0, got: number;
      do { got = readSync(fd, buffer, length, buffer.length - length, null); length += got; } while (got && length < buffer.length);
      requireValid(length === Number(before.size) && same(before, this.stat(fd)));
      this.checkpoint?.("before_adoption_sync", name);
      // Complete crash leftovers become durable before returning any authority.
      fsyncSync(fd); fsyncSync(this.directory.descriptor);
      const probe = openSync(this.path(name), flags);
      try { requireValid(same(before, this.stat(probe)) && same(before, this.stat(fd))); } finally { closeSync(probe); }
      this.assertHeld(); this.seen.set(name, before);
      return buffer.subarray(0, length);
    } finally { closeSync(fd); }
  }
  install(path: string, bytes: Buffer): "installed" | "replayed" {
    const name = this.name(path);
    requireValid(bytes.length <= maxBytes);
    this.assertHeld();
    let fd: number;
    try { fd = openSync(this.path(name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o400); }
    catch (e) {
      if (code(e) !== "EEXIST") throw e;
      const previous = this.read(path);
      if (!previous?.equals(bytes)) throw new Error("Metric evidence already exists with different bytes");
      return "replayed";
    }
    // Never remove a partially installed authoritative name, even on an error.
    try {
      fchmodSync(fd, 0o400); this.stat(fd);
      this.checkpoint?.("file_created", name);
      const first = writeSync(fd, bytes, 0, Math.floor(bytes.length / 2));
      this.checkpoint?.("file_partial", name);
      writeFileSync(fd, bytes.subarray(first));
      this.checkpoint?.("file_written", name);
      fsyncSync(fd); this.checkpoint?.("file_synced", name);
      fsyncSync(this.directory.descriptor); this.checkpoint?.("directory_synced", name);
    } finally { closeSync(fd); }
    requireValid(this.read(path)?.equals(bytes));
    return "installed";
  }
  entries() {
    this.assertHeld();
    const scan = () => {
      const names: string[] = [], directory = opendirSync(`/proc/self/fd/${this.directory.descriptor}`);
      try {
        let entry;
        while ((entry = directory.readSync())) {
          requireValid(names.length < 30_030);
          names.push(entry.name);
        }
      } finally { directory.closeSync(); }
      return names.sort((a, b) => a.localeCompare(b));
    };
    const names = scan();
    const entries = names.map((name) => {
      if (name === "operation.lock") return { name, bytesSha: bytesSha(Buffer.alloc(0)) };
      const bytes = this.read(`${metricRefreshEvidencePath}/${name}`);
      requireValid(bytes !== null);
      return { name, bytesSha: bytesSha(bytes) };
    });
    this.checkpoint?.("directory_enumerated", "");
    requireValid(JSON.stringify(scan()) === JSON.stringify(names));
    this.assertHeld();
    return entries;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.lock !== undefined) closeSync(this.lock);
    this.directory.close();
  }
}
