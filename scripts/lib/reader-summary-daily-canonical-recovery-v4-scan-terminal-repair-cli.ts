import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { Pool } from "pg";

import {
  assertDailyScanTerminalRepairReceipt,
  captureDailyScanTerminalRepairPreimageForReview,
  dailyScanTerminalRepairConfirmation,
  dailyScanTerminalRepairTargets,
  reconcileDailyScanTerminalRepairReceipt,
  repairDailyScanTerminals,
  type DailyScanTerminalRepairReceipt,
} from "./reader-summary-daily-canonical-recovery-v4-scan-terminal-repair";

export const printDailyScanTerminalRepairPreimage = async (): Promise<void> => {
  const pool = createSystemPool(
    "reader-summary-daily-scan-terminal-preimage-c1",
  );
  const client = await pool.connect();
  try {
    const captured =
      await captureDailyScanTerminalRepairPreimageForReview(client);
    console.log(formatDailyScanTerminalPreimageArtifact(captured));
  } finally {
    client.release();
    await pool.end();
  }
};

export const formatDailyScanTerminalPreimageArtifact = (captured: {
  readonly capturedAt: string;
  readonly sha256: string;
  readonly targets: readonly Readonly<{
    target: "hacker_news" | "reddit";
    snapshot: Record<string, unknown>;
  }>[];
}): string => {
  const targets = captured.targets.map((row) => {
    const job = artifactRecord(row.snapshot.job, "job");
    const attempt = artifactRecord(row.snapshot.attempt, "attempt");
    const downstream = artifactRecord(row.snapshot.downstream, "downstream");
    const decisions = row.snapshot.schedulerDecisions;
    if (!Array.isArray(decisions)) {
      throw new Error("Daily scan terminal preimage decisions are invalid");
    }
    const hackerNews = row.target === "hacker_news";
    return {
      target: row.target,
      jobId: hackerNews
        ? dailyScanTerminalRepairTargets.hackerNews.jobId
        : dailyScanTerminalRepairTargets.reddit.jobId,
      sourceBindingId: hackerNews
        ? dailyScanTerminalRepairTargets.hackerNews.sourceBindingId
        : dailyScanTerminalRepairTargets.reddit.sourceBindingId,
      leaseId: hackerNews
        ? dailyScanTerminalRepairTargets.hackerNews.leaseId
        : null,
      leasePresent: row.snapshot.lease !== null,
      jobStatus: artifactString(job.status, "job status"),
      attemptStatus: artifactString(attempt.status, "attempt status"),
      attemptNumber: artifactInteger(attempt.attempt_number, "attempt number"),
      fetched: artifactInteger(attempt.fetched, "fetched"),
      inserted: artifactInteger(attempt.inserted, "inserted"),
      skippedDuplicates: artifactInteger(
        attempt.skipped_duplicates,
        "skipped duplicates",
      ),
      projected: artifactInteger(attempt.projected, "projected"),
      failureReasonSha256:
        attempt.failure_reason === null
          ? null
          : sha256(artifactString(attempt.failure_reason, "failure reason")),
      schedulerDecisionCount: decisions.length,
      downstream: Object.fromEntries(
        [
          "failureQueue",
          "githubCandidates",
          "githubResults",
          "engagementObservations",
          "sourceItems",
          "feedItems",
          "outbox",
          "inbox",
          "idempotency",
          "cursor",
        ].map((key) => [key, artifactInteger(downstream[key], key)]),
      ),
      failureMetadataSqlNull: artifactBoolean(
        row.snapshot.failureMetadataSqlNull,
        "failure metadata SQL null",
      ),
      executionMetadataSqlNull: artifactBoolean(
        row.snapshot.executionMetadataSqlNull,
        "execution metadata SQL null",
      ),
    };
  });
  return JSON.stringify({
    schemaVersion: "reader_summary.daily_scan_terminal_preimage.c1",
    confirmation: dailyScanTerminalRepairConfirmation,
    capturedAt: captured.capturedAt,
    reviewedPreimageSha256: captured.sha256,
    targetCount: targets.length,
    redactedTargetsSha256: sha256(JSON.stringify(targets)),
    targets,
  });
};

export const runDailyScanTerminalRepair = async (
  args: readonly string[],
): Promise<void> => {
  if (
    args.length !== 2 ||
    args[0] !== dailyScanTerminalRepairConfirmation ||
    !/^[0-9a-f]{64}$/u.test(args[1] ?? "")
  ) {
    throw new Error(
      "Daily scan terminal repair requires exact confirmation and reviewed preimage SHA-256",
    );
  }
  const reviewedPreimageSha256 = args[1]!;
  const publicDirectory = resolve(
    required("READER_SUMMARY_DAILY_REPAIR_RECEIPT_DIRECTORY"),
  );
  const receiptPath = join(
    publicDirectory,
    `reader-summary-daily-scan-terminal-repair-c1-${reviewedPreimageSha256}.json`,
  );
  const pool = createSystemPool("reader-summary-daily-scan-terminal-repair-c1");
  const client = await pool.connect();
  let preparedReceiptCreated = false;
  try {
    const existing = readReceiptIfExact(receiptPath, reviewedPreimageSha256);
    if (existing !== null) {
      const state = await reconcileDailyScanTerminalRepairReceipt(
        client,
        existing,
      );
      if (state === "committed") {
        printRepairReceipt(existing);
        return;
      }
      removeDurable(receiptPath);
    }
    const receipt = await repairDailyScanTerminals({
      client,
      reviewedPreimageSha256,
      persistReceiptBeforeCommit: (prepared) => {
        preparedReceiptCreated = writeDurableExact(receiptPath, prepared);
      },
      discardPreparedReceipt: () => {
        if (preparedReceiptCreated) removeDurable(receiptPath);
      },
    });
    const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`, "utf8");
    if (!readFileSync(receiptPath).equals(bytes)) {
      throw new Error(
        "Daily scan terminal repair durable receipt readback diverged",
      );
    }
    printRepairReceipt(receipt);
  } finally {
    client.release();
    await pool.end();
  }
};

const readReceiptIfExact = (
  path: string,
  reviewedSha256: string,
): DailyScanTerminalRepairReceipt | null => {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return assertDailyScanTerminalRepairReceipt(value, reviewedSha256);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Existing daily scan terminal repair receipt conflicts", {
      cause: error,
    });
  }
};

export const printRepairReceipt = (
  input: DailyScanTerminalRepairReceipt,
): void => {
  console.log(formatDailyScanTerminalRepairArtifact(input));
};

export const formatDailyScanTerminalRepairArtifact = (
  input: DailyScanTerminalRepairReceipt,
): string =>
  JSON.stringify({
    schemaVersion: input.schemaVersion,
    confirmation: input.confirmation,
    reviewedPreimageSha256: input.reviewedPreimageSha256,
    transactionTimestamp: input.transactionTimestamp,
    targetCount: input.targets.length,
    restoreEvidenceSha256: input.restoreEvidenceSha256,
    durableReceipt: true,
  });

export const writeDurableExact = (
  path: string,
  receipt: DailyScanTerminalRepairReceipt,
): boolean => {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`, "utf8");
  const stagingPath = join(
    directory,
    `.${basename(path)}.${randomUUID()}.prepared`,
  );
  let published = false;
  try {
    const descriptor = openSync(stagingPath, "wx", 0o400);
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    try {
      linkSync(stagingPath, path);
      published = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (!readFileSync(path).equals(bytes)) {
        throw new Error(
          "Existing daily scan terminal repair receipt conflicts",
        );
      }
    }
    syncDirectory(directory);
  } finally {
    rmSync(stagingPath, { force: true });
    syncDirectory(directory);
  }
  if (!readFileSync(path).equals(bytes)) {
    throw new Error("Daily scan terminal repair prepared receipt diverged");
  }
  return published;
};

const removeDurable = (path: string): void => {
  rmSync(path, { force: true });
  syncDirectory(dirname(path));
};

const syncDirectory = (directory: string): void => {
  const directoryDescriptor = openSync(directory, "r");
  try {
    fsyncSync(directoryDescriptor);
  } finally {
    closeSync(directoryDescriptor);
  }
};

const createSystemPool = (applicationName: string): Pool =>
  new Pool({
    connectionString: requiredSystemDatabaseUrl(),
    min: 0,
    max: 1,
    application_name: applicationName,
  });

const requiredSystemDatabaseUrl = (): string => {
  const value = required("SYSTEM_DATABASE_URL");
  const parsed = new URL(value);
  if (
    !/^postgres(?:ql)?:$/u.test(parsed.protocol) ||
    decodeURIComponent(parsed.username) !== "social_monitor_system_app" ||
    parsed.password.length === 0
  ) {
    throw new Error("SYSTEM_DATABASE_URL must use the production system login");
  }
  return value;
};

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const artifactRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!isRecord(value))
    throw new Error(`Daily scan terminal ${label} is invalid`);
  return value;
};
const artifactString = (value: unknown, label: string): string => {
  if (typeof value !== "string")
    throw new Error(`Daily scan terminal ${label} is invalid`);
  return value;
};
const artifactInteger = (value: unknown, label: string): number => {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error(`Daily scan terminal ${label} is invalid`);
  return parsed;
};
const artifactBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean")
    throw new Error(`Daily scan terminal ${label} is invalid`);
  return value;
};
const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");
