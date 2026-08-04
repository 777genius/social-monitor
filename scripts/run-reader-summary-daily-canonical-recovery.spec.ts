import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  deriveReaderSummaryDailyTerminalDatabaseUrl,
  stageReaderSummaryDailyCanonicalRecoveryPublicFiles,
} from "./run-reader-summary-daily-canonical-recovery";

describe("reader summary daily terminal DSN derivation", () => {
  it("replaces only the system role while preserving encoded credentials and connection fields", () => {
    const systemDatabaseUrl =
      "postgresql://social_monitor_system_app:raw-password@database.example.test:5433/reader%2Fsummary?application_name=daily%20recovery&sslmode=verify-full";

    expect(
      deriveReaderSummaryDailyTerminalDatabaseUrl(systemDatabaseUrl),
    ).toBe(
      "postgresql://social_monitor_reader_summary_daily_terminal:raw-password@database.example.test:5433/reader%2Fsummary?application_name=daily%20recovery&sslmode=verify-full",
    );
  });
});

describe("reader summary daily canonical recovery public staging", () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "daily-canonical-recovery-stage-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("reuses exact immutable files after a pre-commit publication-pending retry", async () => {
    const first = await stageReaderSummaryDailyCanonicalRecoveryPublicFiles(
      directory,
      "model-job-identity",
      "2026-07-23",
      publication(),
    );
    await first.publish();
    await first.cleanup();

    const replay = await stageReaderSummaryDailyCanonicalRecoveryPublicFiles(
      directory,
      "model-job-identity",
      "2026-07-23",
      publication(),
    );
    await expect(replay.publish()).resolves.toBeUndefined();
    await replay.cleanup();

    expect(readFileSync(evidencePath(directory))).toEqual(
      publication().publicEvidenceBytes,
    );
    expect(readFileSync(frontendPath(directory))).toEqual(
      publication().publicFrontendBytes,
    );
  });

  it("fails closed for a mismatched immutable retry without overwriting public evidence", async () => {
    const first = await stageReaderSummaryDailyCanonicalRecoveryPublicFiles(
      directory,
      "model-job-identity",
      "2026-07-23",
      publication(),
    );
    await first.publish();
    await first.cleanup();

    const conflicting =
      await stageReaderSummaryDailyCanonicalRecoveryPublicFiles(
        directory,
        "model-job-identity",
        "2026-07-23",
        publication(Buffer.from("conflicting evidence")),
      );
    await expect(conflicting.publish()).rejects.toThrow(
      "Canonical public file conflicts with immutable bytes",
    );
    await conflicting.cleanup();

    expect(readFileSync(evidencePath(directory))).toEqual(
      publication().publicEvidenceBytes,
    );
    expect(readFileSync(frontendPath(directory))).toEqual(
      publication().publicFrontendBytes,
    );
  });
});

const publication = (publicEvidenceBytes = Buffer.from("evidence")) => ({
  publicEvidenceBytes,
  publicFrontendBytes: Buffer.from("frontend"),
});

const evidencePath = (directory: string): string =>
  join(directory, "durable-reader-summary-2026-07-23.v1.json");

const frontendPath = (directory: string): string =>
  join(directory, "frontend-reader-summary-2026-07-23.fixture.v1.json");
