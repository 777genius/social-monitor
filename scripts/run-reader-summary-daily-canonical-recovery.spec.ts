import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import { buildReaderSummaryDailyCanonicalRecoveryReceipt } from "./lib/reader-summary-daily-model-job-receipt";
import {
  deriveReaderSummaryDailyCanonicalRecoveryExecutionAttestation,
  readerSummaryDailyPersistedResponseSha256,
} from "./lib/reader-summary-daily-publication-finalizer";
import { canonicalJsonBytes } from "./lib/reader-summary-daily-canonical-recovery-v4";
import {
  assertReaderSummaryDailyCanonicalRecoveryResultShape,
  canonicalRecoveryCliExitCode,
  deriveReaderSummaryDailyTerminalDatabaseUrl,
  readerSummaryDailyCanonicalRecoveryPublicExecutionEvidence,
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

describe("reader summary daily canonical recovery CLI outcome", () => {
  it("returns nonzero while a consumed attempt remains ambiguous", () => {
    expect(canonicalRecoveryCliExitCode({ kind: "failed_ambiguous" })).toBe(1);
    expect(canonicalRecoveryCliExitCode({ kind: "caught_up" })).toBe(0);
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

describe("reader summary daily canonical recovery replay evidence", () => {
  it.each([
    ["signal", "completed", strictResponseBytes([]), 1, []],
    [
      "no_signal",
      "no_signal",
      strictResponseBytes(["no_signal"]),
      0,
      ["no_signal"],
    ],
  ] as const)(
    "keeps the receipt attestation byte-identical across fresh and replayed %s output",
    (label, executionStatus, responseBytes, selectedFeedItemCount, qualityFlags) => {
      void label;
      const receiptAttestation = receiptDerivedAttestation(responseBytes);
      const fresh = readerSummaryDailyCanonicalRecoveryPublicExecutionEvidence({
        requestCreated: true,
        executionStatus,
        capturedCommandCount: 1,
        transientAttestations: [receiptAttestation],
        receiptAttestation,
      });
      const replay = readerSummaryDailyCanonicalRecoveryPublicExecutionEvidence({
        requestCreated: false,
        executionStatus,
        capturedCommandCount: 0,
        transientAttestations: [],
        receiptAttestation,
      });

      expect(fresh).toEqual(replay);
      expect(fresh.executionAttestations).toEqual([receiptAttestation]);
      expect(canonicalJsonSha256(fresh.executionAttestations)).toBe(
        canonicalJsonSha256(replay.executionAttestations),
      );
      expect(receiptAttestation.normalizedOutputSha256).toBe(
        hash(responseBytes),
      );
      expect(Object.keys(fresh)).toEqual(["executionAttestations"]);
      expect(JSON.stringify(fresh)).not.toContain("capturedCommandCount");
      assertReaderSummaryDailyCanonicalRecoveryResultShape({
        status: executionStatus,
        selectedFeedItemCount,
        qualityFlags,
      });
    },
  );

  it("rejects tampered receipt bytes and transient admission state", () => {
    const responseBytes = strictResponseBytes([]);
    const receipt = receiptFor(responseBytes);
    const receiptAttestation = receiptDerivedAttestation(responseBytes);

    expect(() =>
      deriveReaderSummaryDailyCanonicalRecoveryExecutionAttestation({
        modelJobIdentity: modelJobIdentity,
        requestedUtcDate: "2026-07-23",
        sourceAuthoritySha256,
        responseBytes,
        receiptBytes: Buffer.concat([receipt.receiptBytes, Buffer.from(" ")]),
      }),
    ).toThrow();
    expect(() =>
      deriveReaderSummaryDailyCanonicalRecoveryExecutionAttestation({
        modelJobIdentity: modelJobIdentity,
        requestedUtcDate: "2026-07-23",
        sourceAuthoritySha256,
        responseBytes: Buffer.concat([responseBytes, Buffer.from("\n")]),
        receiptBytes: receipt.receiptBytes,
      }),
    ).toThrow(/strict canonical JSON/u);
    expect(() =>
      readerSummaryDailyCanonicalRecoveryPublicExecutionEvidence({
        requestCreated: true,
        executionStatus: "completed",
        capturedCommandCount: 1,
        transientAttestations: [{
          ...receiptAttestation,
          normalizedOutputSha256: "0".repeat(64),
        }],
        receiptAttestation,
      }),
    ).toThrow(/fresh attestation admission diverged/u);
    expect(() =>
      readerSummaryDailyCanonicalRecoveryPublicExecutionEvidence({
        requestCreated: false,
        executionStatus: "completed",
        capturedCommandCount: 0,
        transientAttestations: [receiptAttestation],
        receiptAttestation,
      }),
    ).toThrow(/replay retained ephemeral admission state/u);
    expect(() =>
      readerSummaryDailyCanonicalRecoveryPublicExecutionEvidence({
        requestCreated: true,
        executionStatus: "completed",
        capturedCommandCount: 0,
        transientAttestations: [receiptAttestation],
        receiptAttestation,
      }),
    ).toThrow(/fresh queue admission diverged/u);
    expect(() =>
      readerSummaryDailyCanonicalRecoveryPublicExecutionEvidence({
        requestCreated: false,
        executionStatus: "completed",
        capturedCommandCount: 1,
        transientAttestations: [],
        receiptAttestation,
      }),
    ).toThrow(/replay queue admission diverged/u);
  });

  it("rejects terminal result shapes that conflict with signal semantics", () => {
    expect(() =>
      assertReaderSummaryDailyCanonicalRecoveryResultShape({
        status: "completed",
        selectedFeedItemCount: 0,
        qualityFlags: [],
      }),
    ).toThrow(/completed result shape is invalid/u);
    expect(() =>
      assertReaderSummaryDailyCanonicalRecoveryResultShape({
        status: "completed",
        selectedFeedItemCount: 1,
        qualityFlags: ["no_signal"],
      }),
    ).toThrow(/completed result shape is invalid/u);
    expect(() =>
      assertReaderSummaryDailyCanonicalRecoveryResultShape({
        status: "no_signal",
        selectedFeedItemCount: 1,
        qualityFlags: ["no_signal"],
      }),
    ).toThrow(/no_signal result shape is invalid/u);
    expect(() =>
      assertReaderSummaryDailyCanonicalRecoveryResultShape({
        status: "no_signal",
        selectedFeedItemCount: 0,
        qualityFlags: [],
      }),
    ).toThrow(/no_signal result shape is invalid/u);
  });

  it("hashes output_text bytes while retaining canonical draft hashes for structured output", () => {
    const responseBytes = strictResponseBytes([]);
    const draft = { z: "last", a: "first" };

    const outputTextSha256 = readerSummaryDailyPersistedResponseSha256({
      outputKind: "output_text",
      responseBytes,
      draft,
    });
    const structuredSha256 = readerSummaryDailyPersistedResponseSha256({
      outputKind: "structured_output",
      responseBytes,
      draft,
    });

    expect(outputTextSha256).toBe(hash(responseBytes));
    expect(structuredSha256).toBe(canonicalJsonSha256(draft));
    expect(outputTextSha256).not.toBe(structuredSha256);
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

const modelJobIdentity = "a".repeat(64);
const sourceAuthoritySha256 = "b".repeat(64);

function strictResponseBytes(qualityFlags: readonly string[]): Buffer {
  return canonicalJsonBytes({
    citationMap: [],
    confidence: {},
    content: {},
    executiveSummary: "Persisted canonical response.",
    headline: "Canonical response",
    interestHighlights: [],
    narrativeSections: [],
    noSignalReason: qualityFlags.includes("no_signal")
      ? "No immutable signal was selected."
      : null,
    qualityFlags,
    repeatedSignals: [],
    risksAndUnknowns: [],
    topStories: [],
  });
}

const receiptDerivedAttestation = (responseBytes: Buffer) => {
  const receipt = receiptFor(responseBytes);
  return deriveReaderSummaryDailyCanonicalRecoveryExecutionAttestation({
    modelJobIdentity,
    requestedUtcDate: "2026-07-23",
    sourceAuthoritySha256,
    responseBytes,
    receiptBytes: receipt.receiptBytes,
  });
};

const receiptFor = (responseBytes: Buffer) =>
  buildReaderSummaryDailyCanonicalRecoveryReceipt({
    modelJobIdentity,
    requestedUtcDate: "2026-07-23",
    sourceAuthoritySha256,
    responseBytes,
    rawOutputSha256: hash(responseBytes),
    rawOutputByteLength: responseBytes.length,
    attestation: {
      schemaVersion: 1,
      requestId: "daily-recovery-request",
      purpose: "social_monitor.reader_summary.daily.canonical_recovery.v2",
      canonicalRequestSha256: "c".repeat(64),
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      runtimeEngine: "subscription-runtime-cli",
      runtimePackageVersion: "0.1.0-main.2",
      launcherSha256: "d".repeat(64),
      selectedOutputKind: "output_text",
      selectedOutputSha256: hash(responseBytes),
    },
  });

const hash = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");
