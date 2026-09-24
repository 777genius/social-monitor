import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, writeSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

type Reservation = Readonly<{
  schema: "hn-rss-acquisition.v1";
  status: "STARTED";
  planSha256: string;
  runId: string;
  attemptId: string;
  scanJobId: string;
  scope: Readonly<{ tenantId: string; workspaceId: string; sourceBindingId: string; interestId: string; scanPolicyId: string; providerKey: string; from: string; to: string; configSha256: string; interestQuerySha256: string }>;
}>;
type Receipt = Readonly<{ schema: "hn-rss-acquisition.v1"; status: "COMPLETED"; planSha256: string; runId: string; attemptId: string; scanJobId: string; fetched: number; inserted: number; projected: number; skippedDuplicates: number; warningCount: number }>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertPrivateJournalDir(path: string): void {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) throw new Error("Journal directory must be a canonical absolute path");
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || (typeof process.getuid === "function" && stat.uid !== process.getuid())) {
    throw new Error("Journal directory must be owned, private and not a symlink");
  }
}

const file = (directory: string, digest: string, kind: "started" | "completed"): string => {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid journal plan digest");
  return join(directory, `${digest}.${kind}.json`);
};

function writeExclusive(directory: string, path: string, value: unknown): void {
  const fd = openSync(path, "wx", 0o600);
  try {
    const payload = Buffer.from(`${JSON.stringify(value)}\n`);
    let offset = 0;
    while (offset < payload.length) {
      const written = writeSync(fd, payload, offset, payload.length - offset);
      if (written <= 0) throw new Error("Recovery journal write did not advance");
      offset += written;
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  const dirFd = openSync(directory, "r");
  try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
}

function readPrivate(path: string): unknown {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || (typeof process.getuid === "function" && stat.uid !== process.getuid())) {
    throw new Error("Journal record is not a private regular file");
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function isReservation(value: unknown, digest: string): value is Reservation {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).sort().join(",") === "attemptId,planSha256,runId,scanJobId,schema,scope,status" && row.schema === "hn-rss-acquisition.v1" && row.status === "STARTED" && row.planSha256 === digest && uuid.test(String(row.runId)) && uuid.test(String(row.attemptId)) && uuid.test(String(row.scanJobId)) && row.scope !== null && typeof row.scope === "object";
}

function isReceipt(value: unknown, reservation: Reservation): value is Receipt {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).sort().join(",") === "attemptId,fetched,inserted,planSha256,projected,runId,scanJobId,schema,skippedDuplicates,status,warningCount" && row.schema === reservation.schema && row.status === "COMPLETED" && row.planSha256 === reservation.planSha256 && row.runId === reservation.runId && row.attemptId === reservation.attemptId && row.scanJobId === reservation.scanJobId && row.warningCount === 0 && ["fetched", "inserted", "projected", "skippedDuplicates", "warningCount"].every((key) => Number.isSafeInteger(row[key]) && Number(row[key]) >= 0);
}

/** Existing uncertain reservations are never resumed automatically. */
export function reserveRecovery(directory: string, digest: string, scope: Reservation["scope"]):
  | { readonly kind: "reserved"; readonly reservation: Reservation }
  | { readonly kind: "completed"; readonly receipt: Receipt } {
  assertPrivateJournalDir(directory);
  const started = file(directory, digest, "started");
  const completed = file(directory, digest, "completed");
  if (existsSync(started) || existsSync(completed)) {
    if (!existsSync(started)) throw new Error("Recovery journal has an orphan completion record");
    const reservation = readPrivate(started);
    if (!isReservation(reservation, digest) || JSON.stringify(reservation.scope) !== JSON.stringify(scope)) throw new Error("Recovery journal reservation is inconsistent");
    if (!existsSync(completed)) throw new Error("Recovery plan has an uncertain STARTED outcome; reconcile manually");
    const receipt = readPrivate(completed);
    if (!isReceipt(receipt, reservation)) throw new Error("Recovery completion record is inconsistent; reconcile manually");
    return { kind: "completed", receipt };
  }
  const reservation: Reservation = { schema: "hn-rss-acquisition.v1", status: "STARTED", planSha256: digest, runId: randomUUID(), attemptId: randomUUID(), scanJobId: randomUUID(), scope };
  writeExclusive(directory, started, reservation);
  return { kind: "reserved", reservation };
}

export function completeRecovery(directory: string, reservation: Reservation, counts: Pick<Receipt, "fetched" | "inserted" | "projected" | "skippedDuplicates" | "warningCount">): Receipt {
  assertPrivateJournalDir(directory);
  const started = readPrivate(file(directory, reservation.planSha256, "started"));
  if (!isReservation(started, reservation.planSha256) || JSON.stringify(started) !== JSON.stringify(reservation)) {
    throw new Error("Recovery journal reservation is inconsistent");
  }
  if (![counts.fetched, counts.inserted, counts.projected, counts.skippedDuplicates, counts.warningCount]
    .every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error("Recovery result counts are invalid");
  if (counts.warningCount !== 0) throw new Error("Recovery acquisition was incomplete");
  const receipt: Receipt = { schema: reservation.schema, status: "COMPLETED", planSha256: reservation.planSha256, runId: reservation.runId, attemptId: reservation.attemptId, scanJobId: reservation.scanJobId, fetched: counts.fetched, inserted: counts.inserted, projected: counts.projected, skippedDuplicates: counts.skippedDuplicates, warningCount: counts.warningCount };
  writeExclusive(directory, file(directory, reservation.planSha256, "completed"), receipt);
  return receipt;
}
