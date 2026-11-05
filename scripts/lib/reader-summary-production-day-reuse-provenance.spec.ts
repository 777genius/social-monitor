import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  requiredProductionDayStepIds,
  type ProductionDayStepReport,
} from "./reader-summary-production-day-collection-barrier";
import { buildProductionDayReport } from "./reader-summary-production-day-report";
import {
  attachCaptureExecutionEvidence,
  inspectDurableEvidenceArtifact,
  productionDayUtcPeriod,
  sha256Hex,
} from "./reader-summary-production-day-provenance";
import { productionExecutionAttestations } from "./reader-summary-production-day-attestation.spec-support";
import {
  loadHistoricalReuseProvenance,
  type ProductionDayExecutionRequest,
} from "./reader-summary-production-day-reuse-provenance";

const collectionDate = "2026-07-15";

describe("historical production-day reuse provenance", () => {
  it("binds both the immutable source report and actual evidence bytes", () => {
    withArtifacts(({ request, evidencePath, frontendFixturePath }) => {
      const loaded = loadHistoricalReuseProvenance({
        request,
        evidencePath,
        frontendFixturePath,
        collectionDate,
      });

      expect(loaded.provenance.nonLive).toBe(true);
      expect(loaded.provenance.sourceReport.sha256).toBe(
        request.sourceReportSha256,
      );
      expect(loaded.provenance.sourceEvidence.sha256).toBe(
        request.evidenceArtifactSha256,
      );
    });
  });

  it("rejects modified evidence with unchanged IDs and expected hash", () => {
    withArtifacts(({ request, evidencePath, frontendFixturePath }) => {
      const modified = JSON.parse(readFileSync(evidencePath, "utf8")) as {
        result: { headline?: string };
      };
      modified.result.headline = "modified but same artifact and summary ids";
      writeFileSync(evidencePath, `${JSON.stringify(modified)}\n`);

      expect(() =>
        loadHistoricalReuseProvenance({
          request,
          evidencePath,
          frontendFixturePath,
          collectionDate,
        }),
      ).toThrow("evidence artifact content hash does not match");
    });
  });

  it("rejects modified evidence even when the caller supplies its new hash", () => {
    withArtifacts(({ request, evidencePath, frontendFixturePath }) => {
      const modified = JSON.parse(readFileSync(evidencePath, "utf8")) as {
        result: { headline?: string };
      };
      modified.result.headline = "modified and rehashed with same ids";
      const bytes = Buffer.from(`${JSON.stringify(modified)}\n`, "utf8");
      writeFileSync(evidencePath, bytes);

      expect(() =>
        loadHistoricalReuseProvenance({
          request: {
            ...request,
            evidenceArtifactSha256: sha256Hex(bytes),
          },
          evidencePath,
          frontendFixturePath,
          collectionDate,
        }),
      ).toThrow("source report is not reusable");
    });
  });

  it("rejects modified frontend evidence with unchanged summary IDs", () => {
    withArtifacts(({ request, evidencePath, frontendFixturePath }) => {
      const frontend = JSON.parse(
        readFileSync(frontendFixturePath, "utf8"),
      ) as { readerSummaryArtifact: { lineage: { modelVersion: string } } };
      frontend.readerSummaryArtifact.lineage.modelVersion =
        "codex:gpt-5.6-sol:xhigh-modified";
      writeFileSync(frontendFixturePath, `${JSON.stringify(frontend)}\n`);

      expect(() =>
        loadHistoricalReuseProvenance({
          request,
          evidencePath,
          frontendFixturePath,
          collectionDate,
        }),
      ).toThrow("Historical evidence artifact is invalid");
    });
  });
});

function withArtifacts(
  assertion: (params: {
    readonly request: HistoricalRequest;
    readonly evidencePath: string;
    readonly frontendFixturePath: string;
  }) => void,
): void {
  const directory = mkdtempSync(join(tmpdir(), "production-day-reuse-"));
  try {
    const evidencePath = join(directory, "evidence.json");
    const frontendFixturePath = join(directory, "frontend.json");
    const sourceReportPath = join(directory, "source-report.json");
    const fixture = evidenceFixture();
    const evidence = fixture.evidence;
    writeFileSync(frontendFixturePath, fixture.frontendBytes);
    const evidenceBytes = Buffer.from(`${JSON.stringify(evidence)}\n`, "utf8");
    writeFileSync(evidencePath, evidenceBytes);
    const inspection = inspectDurableEvidenceArtifact({
      evidence,
      evidenceBytes,
      frontendArtifact: fixture.frontend,
      frontendBytes: fixture.frontendBytes,
      expectedDate: collectionDate,
    });
    if (inspection.binding === null) {
      throw new Error(inspection.violations.join("; "));
    }
    const report = buildLiveReport(
      evidencePath,
      frontendFixturePath,
      evidence,
      inspection.binding,
    );
    const reportBytes = Buffer.from(`${JSON.stringify(report)}\n`, "utf8");
    writeFileSync(sourceReportPath, reportBytes);
    if (report.reportIdentity === null) {
      throw new Error("test report identity missing");
    }
    assertion({
      evidencePath,
      frontendFixturePath,
      request: {
        mode: "historical-reuse",
        sourceReportPath,
        sourceReportArtifactId: report.reportIdentity.artifactId,
        sourceReportSha256: sha256Hex(reportBytes),
        evidenceArtifactId: inspection.binding.artifactId,
        evidenceArtifactSha256: inspection.binding.sha256,
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

type HistoricalRequest = Extract<
  ProductionDayExecutionRequest,
  { readonly mode: "historical-reuse" }
>;

function buildLiveReport(
  evidencePath: string,
  frontendFixturePath: string,
  evidence: ReturnType<typeof evidenceFixture>["evidence"],
  binding: NonNullable<
    ReturnType<typeof inspectDurableEvidenceArtifact>["binding"]
  >,
) {
  return buildProductionDayReport({
    executionMode: "live-production",
    historicalReuseProvenance: null,
    historicalRegenerationProvenance: null,
    collectionDate,
    evidencePath,
    frontendFixturePath,
    startedAt: new Date(`${collectionDate}T01:00:00.000Z`),
    completedAt: new Date(`${collectionDate}T01:01:00.000Z`),
    steps: passedSteps(),
    scope: { tenantId: "tenant", workspaceId: "workspace" },
    collectionQuality: {
      collectionDate,
      dayWindowAudit: { publishedInsideWindowFeedItemCount: 5 },
      xAccountPool: {
        totalAccountCount: 1,
        eligibleAccountCount: 1,
        attributionStatus: "unknown",
        attributionPolicy: "warning_only",
        attributionGateReason:
          "unknown_attribution_global_collection_succeeded_warning_only",
        eligibleAccountZeroAttributableOutputWarningCount: 0,
        attributionWarnings: [],
      },
    },
    durableEvidence: evidence,
    evidenceBinding: binding,
    liveCaptureExecution: binding.captureExecution,
    allowDegraded: false,
    allowHistorical: false,
    failure: null,
  });
}

function passedSteps(): readonly ProductionDayStepReport[] {
  return requiredProductionDayStepIds.map((id) => ({
    id,
    command: `npm run real:${id}`,
    status: "passed",
    durationMs: 1,
    exitCode: 0,
  }));
}

function evidenceFixture() {
  const frontend = {
    schemaVersion: 1,
    format: "frontend-reader-summary-live-fixture-v1",
    generatedAt: "2026-07-16T01:00:11.000Z",
    readerSummaryArtifact: {
      readerSummaryId: "11111111-1111-4111-8111-111111111111",
      period: productionDayUtcPeriod(collectionDate),
      lineage: {
        modelVersion: "codex:gpt-5.6-sol:high",
        providerVersion: "agent-runtime",
      },
      content: { topicMap: { generatedBy: "agent-runtime" } },
    },
    evidence: {
      readerSummaryId: "11111111-1111-4111-8111-111111111111",
      readerSummaryJobId: "22222222-2222-4222-8222-222222222222",
    },
  };
  const frontendBytes = Buffer.from(`${JSON.stringify(frontend)}\n`, "utf8");
  const rawEvidence = {
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
    period: productionDayUtcPeriod(collectionDate),
    result: {
      readerSummaryId: "11111111-1111-4111-8111-111111111111",
      readerSummaryJobId: "22222222-2222-4222-8222-222222222222",
      status: "completed",
      selectedFeedItemCount: 5,
      topReadCount: 3,
    },
    executionAttestations: productionExecutionAttestations(),
  };
  const evidence = attachCaptureExecutionEvidence({
    evidence: rawEvidence,
    frontendArtifact: frontend,
    frontendBytes,
    capture: {
      executionId: "55555555-5555-4555-8555-555555555555",
      startedAt: "2026-07-16T01:00:00.000Z",
      completedAt: "2026-07-16T01:01:00.000Z",
    },
    runtimeHealth: {
      status: "serving",
      runtimeEngine: "subscription-runtime-cli",
      runtimeVersion: "0.1.0-main.2",
      launcherSha256: "b".repeat(64),
      checkedAt: "2026-07-16T01:00:30.000Z",
    },
  }) as typeof rawEvidence;
  return { evidence, frontend, frontendBytes };
}
