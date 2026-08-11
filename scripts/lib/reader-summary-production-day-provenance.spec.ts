import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  attachCaptureExecutionEvidence,
  inspectDurableEvidenceArtifact,
  productionDayReportIdentity,
  productionDayUtcPeriod,
  readRequiredFreshCaptureCandidates,
  reportIdentityMatches,
  summaryBindingMatches,
} from "./reader-summary-production-day-provenance";

const collectionDate = "2026-07-15";
const readerSummaryId = "11111111-1111-4111-8111-111111111111";
const readerSummaryJobId = "22222222-2222-4222-8222-222222222222";
const capture = {
  executionId: "55555555-5555-4555-8555-555555555555",
  startedAt: "2026-07-16T01:00:00.000Z",
  completedAt: "2026-07-16T01:01:00.000Z",
};
const runtimeHealth = {
  status: "serving",
  runtimeEngine: "subscription-runtime-cli",
  runtimeVersion: "0.1.0-main.2",
  launcherSha256: "b".repeat(64),
  checkedAt: "2026-07-16T01:00:30.000Z",
};

describe("production-day evidence provenance", () => {
  it("binds persisted UUIDs, both artifact hashes, runtime result and UTC period", () => {
    const inspected = inspect(evidence());

    expect(inspected.violations).toEqual([]);
    expect(inspected.binding).toMatchObject({
      readerSummaryId,
      readerSummaryJobId,
      artifactId: "durable-reader-summary-postgres-evidence-v1",
      requestedUtcPeriod: productionDayUtcPeriod(collectionDate),
      captureExecution: { executionId: capture.executionId },
      runtimeProvenance: {
        execution: "attested",
        physicalModel: "gpt-5.5",
        provider: "codex",
        runtime: "subscription-runtime-cli",
        runtimeVersion: "0.1.0-main.2",
        reasoningEffort: "xhigh",
      },
    });
    expect(inspected.binding?.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(inspected.binding?.captureExecution.frontendArtifactSha256).toMatch(
      /^[0-9a-f]{64}$/u,
    );
  });

  it.each([
    ["readerSummaryId", "summary-1"],
    ["readerSummaryJobId", "job-1"],
    ["readerSummaryId", ""],
  ] as const)("rejects malformed %s", (field, value) => {
    const artifact = evidence();
    if (field === "readerSummaryId") {
      artifact.result.readerSummaryId = value;
    } else {
      artifact.result.readerSummaryJobId = value;
    }

    expect(inspect(artifact).binding).toBeNull();
  });

  it("rejects a mismatched or non-UTC evidence period", () => {
    const wrongDate = evidence();
    wrongDate.period.startedAt = "2026-07-14T00:00:00.000Z";
    const wrongTimezone = evidence();
    (wrongTimezone.period as { timezone: string }).timezone =
      "America/New_York";

    expect(inspect(wrongDate).binding).toBeNull();
    expect(inspect(wrongTimezone).binding).toBeNull();
  });

  it("rejects fixture, deterministic and non-Postgres provenance", () => {
    for (const mutate of [
      (artifact: ReturnType<typeof evidence>) => {
        artifact.provenance.fixtureOnly = true;
      },
      (artifact: ReturnType<typeof evidence>) => {
        artifact.provenance.modelMode = "deterministic";
      },
      (artifact: ReturnType<typeof evidence>) => {
        artifact.provenance.database = "memory";
      },
    ]) {
      const artifact = evidence();
      mutate(artifact);
      expect(inspect(artifact).binding).toBeNull();
    }
  });

  it.each([
    ["provider", "claude"],
    ["model", "gpt-4"],
    ["reasoningEffort", "high"],
    ["runtimeEngine", "direct"],
    ["runtimePackageVersion", "unknown"],
  ] as const)(
    "rejects misconfigured executor attestation field %s",
    (field, value) => {
      const artifact = evidence();
      artifact.executionAttestations[0]!.attestation[field] = value;

      expect(inspect(artifact).binding).toBeNull();
    },
  );

  it.each([
    ["runtimePackageVersion", "0.1.0-main.1"],
    ["launcherSha256", "d".repeat(64)],
  ] as const)("rejects task identity mismatch in %s", (field, value) => {
    const artifact = evidence();
    artifact.executionAttestations[0]!.attestation[field] = value;

    expect(inspect(artifact).binding).toBeNull();
  });

  it("rejects a live identity that contradicts executor attestations", () => {
    const artifact = evidence(frontendArtifact(), {
      ...runtimeHealth,
      runtimeEngine: "generic-health-label",
      runtimeVersion: "unknown",
    });

    expect(inspect(artifact).binding).toBeNull();
  });

  it.each(["missing", "duplicate", "malformed"] as const)(
    "fails closed for %s execution attestations",
    (mode) => {
      const artifact = evidence();
      if (mode === "missing") {
        artifact.executionAttestations = artifact.executionAttestations.filter(
          (value) => value.taskRole !== "summary",
        );
      } else if (mode === "duplicate") {
        artifact.executionAttestations.push(
          structuredClone(artifact.executionAttestations[0]!),
        );
      } else {
        artifact.executionAttestations[0]!.attestation.launcherSha256 =
          "wrong-launcher";
      }
      expect(inspect(artifact).binding).toBeNull();
    },
  );

  it("rejects competing primary and repair summary attestations", () => {
    const artifact = evidence();
    artifact.executionAttestations.push(
      executionAttestation(
        "summary",
        "repair",
        "reader-summary-repair-request",
        "social_monitor.reader_summary.repair",
      ),
    );

    expect(inspect(artifact).binding).toBeNull();
  });

  it("accepts immutable historical attestation bytes after a runtime upgrade", () => {
    const artifact = evidence(
      frontendArtifact(),
      {
        ...runtimeHealth,
        runtimeVersion: "0.1.0-main.1",
        launcherSha256: "d".repeat(64),
      },
      (raw) => {
        for (const record of raw.executionAttestations) {
          record.attestation.runtimePackageVersion = "0.1.0-main.1";
          record.attestation.launcherSha256 = "d".repeat(64);
        }
      },
    );

    expect(inspect(artifact).binding?.runtimeProvenance).toMatchObject({
      runtimeVersion: "0.1.0-main.1",
      launcherSha256: "d".repeat(64),
    });
  });

  it("allows not_executed only for a true no-signal result", () => {
    const valid = evidence(frontendArtifact(), runtimeHealth, (raw) => {
      raw.result.status = "no_signal";
      raw.result.selectedFeedItemCount = 0;
      raw.executionAttestations = [];
    });
    expect(inspect(valid).binding?.runtimeProvenance).toEqual({
      execution: "not_executed",
      reason: "no_signal",
    });

    const misuse = evidence();
    misuse.result.status = "completed";
    misuse.result.selectedFeedItemCount = 0;
    misuse.executionAttestations = [];
    expect(inspect(misuse).binding).toBeNull();

    const falselyAttested = evidence();
    falselyAttested.result.status = "no_signal";
    falselyAttested.result.selectedFeedItemCount = 0;
    expect(inspect(falselyAttested).binding).toBeNull();
  });

  it("rejects a topicMap overwrite that contradicts executor attestations", () => {
    const frontend = frontendArtifact();
    frontend.readerSummaryArtifact.content.topicMap.generatedBy =
      "deterministic";

    expect(() => evidence(frontend)).toThrow(
      "durable content hashes must agree",
    );
  });

  it("rejects stale capture timestamps and a different current execution", () => {
    const stale = evidence();
    stale.generatedAt = "2026-07-15T01:00:10.000Z";
    expect(inspect(stale).binding).toBeNull();

    const inspected = inspect(evidence(), frontendArtifact(), {
      ...capture,
      executionId: "66666666-6666-4666-8666-666666666666",
    });
    expect(inspected.binding).toBeNull();
  });

  it.each(["evidence", "frontend"] as const)(
    "fails closed when a successful capture produces only %s",
    (only) => {
      const directory = mkdtempSync(join(tmpdir(), "capture-candidates-"));
      try {
        const evidencePath = join(directory, "evidence.next.json");
        const frontendPath = join(directory, "frontend.next.json");
        writeFileSync(
          only === "evidence" ? evidencePath : frontendPath,
          "{}\n",
        );

        expect(() =>
          readRequiredFreshCaptureCandidates({
            evidencePath,
            frontendPath,
            capture: {
              executionId: capture.executionId,
              startedAt: new Date(Date.now() - 1_000).toISOString(),
              completedAt: new Date(Date.now() + 1_000).toISOString(),
            },
          }),
        ).toThrow("must produce both fresh evidence and frontend artifacts");
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it("does not accept a stale canonical artifact after capture reports success with no output", () => {
    const directory = mkdtempSync(join(tmpdir(), "capture-candidates-"));
    try {
      writeFileSync(join(directory, "evidence.json"), '{"stale":true}\n');
      writeFileSync(join(directory, "frontend.json"), '{"stale":true}\n');
      expect(() =>
        readRequiredFreshCaptureCandidates({
          evidencePath: join(directory, "evidence.next.json"),
          frontendPath: join(directory, "frontend.next.json"),
          capture: currentCaptureWindow(),
        }),
      ).toThrow("must produce both fresh evidence and frontend artifacts");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("accepts both candidates only when they are fresh for the execution", () => {
    const directory = mkdtempSync(join(tmpdir(), "capture-candidates-"));
    try {
      const evidencePath = join(directory, "evidence.next.json");
      const frontendPath = join(directory, "frontend.next.json");
      writeFileSync(evidencePath, "{}\n");
      writeFileSync(frontendPath, "{}\n");
      const candidates = readRequiredFreshCaptureCandidates({
        evidencePath,
        frontendPath,
        capture: currentCaptureWindow(),
      });

      expect(candidates.evidence).toEqual({});
      expect(candidates.frontendArtifact).toEqual({});
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("requires summary and report identity to match every evidence field", () => {
    const binding = inspect(evidence()).binding;
    expect(binding).not.toBeNull();
    if (binding === null) {
      return;
    }
    const summary = {
      readerSummaryId,
      readerSummaryJobId,
      evidenceArtifactId: binding.artifactId,
      evidenceArtifactSha256: binding.sha256,
      evidenceArtifactByteLength: binding.byteLength,
      requestedUtcPeriod: binding.requestedUtcPeriod,
      captureExecution: binding.captureExecution,
      runtimeProvenance: binding.runtimeProvenance,
    };
    const identity = productionDayReportIdentity({ collectionDate, binding });

    expect(summaryBindingMatches({ summary, binding })).toBe(true);
    expect(
      reportIdentityMatches({
        reportIdentity: identity,
        collectionDate,
        binding,
      }),
    ).toBe(true);
    expect(
      summaryBindingMatches({
        summary: { ...summary, readerSummaryId: readerSummaryJobId },
        binding,
      }),
    ).toBe(false);
    expect(
      reportIdentityMatches({
        reportIdentity: { ...identity, frontendArtifactSha256: "0".repeat(64) },
        collectionDate,
        binding,
      }),
    ).toBe(false);
  });
});

function inspect(
  artifact: ReturnType<typeof evidence>,
  frontend = frontendArtifact(),
  expectedCapture = capture,
) {
  const evidenceBytes = Buffer.from(`${JSON.stringify(artifact)}\n`, "utf8");
  const frontendBytes = Buffer.from(`${JSON.stringify(frontend)}\n`, "utf8");
  return inspectDurableEvidenceArtifact({
    evidence: artifact,
    evidenceBytes,
    frontendArtifact: frontend,
    frontendBytes,
    expectedDate: collectionDate,
    expectedCapture,
  });
}

function currentCaptureWindow() {
  return {
    executionId: capture.executionId,
    startedAt: new Date(Date.now() - 1_000).toISOString(),
    completedAt: new Date(Date.now() + 1_000).toISOString(),
  };
}

function evidence(
  frontend = frontendArtifact(),
  health = runtimeHealth,
  mutateRaw?: (value: ReturnType<typeof rawEvidence>) => void,
) {
  const raw = rawEvidence();
  mutateRaw?.(raw);
  return attachCaptureExecutionEvidence({
    evidence: raw,
    frontendArtifact: frontend,
    frontendBytes: Buffer.from(`${JSON.stringify(frontend)}\n`, "utf8"),
    capture,
    runtimeHealth: health,
  }) as typeof raw & {
    generatedAt: string;
    captureExecution: {
      runtimeResult: unknown;
    };
  };
}

function rawEvidence() {
  return {
    schemaVersion: 1,
    artifactId: "durable-reader-summary-postgres-evidence-v1",
    format: "durable-reader-summary-postgres-evidence-v1",
    generatedAt: "2026-07-16T01:00:10.000Z",
    provenance: {
      runner: "scripts/capture-durable-reader-summary-from-postgres.ts",
      fixtureOnly: false,
      database: "postgres",
      modelMode: "agent-runtime",
    },
    period: { ...productionDayUtcPeriod(collectionDate) },
    result: {
      readerSummaryId,
      readerSummaryJobId,
      status: "completed",
      selectedFeedItemCount: 5,
      topReadCount: 3,
    },
    executionAttestations: executorAttestations(),
  };
}

function executorAttestations() {
  return [
    executionAttestation(
      "summary",
      "primary",
      "reader-summary-request",
      "social_monitor.reader_summary.generate",
    ),
    executionAttestation(
      "topic_label",
      "1",
      "reader-summary-topic-label-request",
      "social_monitor.reader_summary.topic_map.label",
    ),
  ];
}

function executionAttestation(
  taskRole: "summary" | "topic_label",
  attempt: string,
  requestId: string,
  purpose: string,
) {
  return {
    taskRole,
    attempt,
    normalizedOutputSha256: "d".repeat(64),
    attestation: {
      schemaVersion: 1,
      requestId,
      purpose,
      canonicalRequestSha256: "a".repeat(64),
      provider: "codex",
      model: "gpt-5.5",
      reasoningEffort: "xhigh",
      runtimeEngine: "subscription-runtime-cli",
      runtimePackageVersion: "0.1.0-main.2",
      launcherSha256: "b".repeat(64),
      selectedOutputKind: "structured_output",
      selectedOutputSha256: "c".repeat(64),
    } as Record<string, unknown>,
  };
}

function frontendArtifact() {
  return {
    schemaVersion: 1,
    format: "frontend-reader-summary-live-fixture-v1",
    generatedAt: "2026-07-16T01:00:11.000Z",
    readerSummaryArtifact: {
      readerSummaryId,
      period: productionDayUtcPeriod(collectionDate),
      lineage: {
        modelVersion: "codex:gpt-5.5:xhigh",
        providerVersion: "agent-runtime",
      },
      content: { topicMap: { generatedBy: "agent-runtime" } },
    },
    evidence: { readerSummaryId, readerSummaryJobId },
  };
}
