import {
  requiredProductionDayStepIds,
  type ProductionDayStepReport,
} from "./reader-summary-production-day-collection-barrier";
import {
  buildProductionDayReport,
  validateLiveProductionDayReport,
} from "./reader-summary-production-day-report";
import {
  attachCaptureExecutionEvidence,
  inspectDurableEvidenceArtifact,
  productionDayUtcPeriod,
} from "./reader-summary-production-day-provenance";
import { productionExecutionAttestations } from "./reader-summary-production-day-attestation.spec-support";

const collectionDate = "2026-07-15";
const readerSummaryId = "11111111-1111-4111-8111-111111111111";
const readerSummaryJobId = "22222222-2222-4222-8222-222222222222";

describe("production-day report", () => {
  it("passes a live report with all nine real steps and exact evidence", () => {
    const { report, binding } = liveReport();

    expect(report.steps.map((step) => step.id)).toEqual(
      requiredProductionDayStepIds,
    );
    expect(report.blockingPassed).toBe(true);
    expect(report.inputs).not.toHaveProperty("evidencePath");
    expect(report.inputs).not.toHaveProperty("frontendFixturePath");
    expect(JSON.stringify(report)).not.toContain("/tmp/");
    expect(
      validateLiveProductionDayReport({
        report,
        binding,
        expectedDate: collectionDate,
      }),
    ).toEqual([]);
  });

  it.each(requiredProductionDayStepIds)(
    "blocks when %s is missing",
    (stepId) => {
      expect(
        buildReport(passedSteps().filter((step) => step.id !== stepId))
          .blockingPassed,
      ).toBe(false);
    },
  );

  it.each(requiredProductionDayStepIds)(
    "blocks when %s is duplicated",
    (stepId) => {
      const steps = passedSteps();
      const duplicate = steps.find((step) => step.id === stepId);
      expect(duplicate).toBeDefined();
      expect(
        buildReport([...steps, duplicate as ProductionDayStepReport])
          .blockingPassed,
      ).toBe(false);
    },
  );

  it.each(["skipped", "failed"] as const)(
    "blocks when one of the nine steps is %s",
    (status) => {
      const steps = passedSteps().map((step) =>
        step.id === "collect"
          ? {
              ...step,
              status,
              exitCode: status === "skipped" ? null : 1,
            }
          : step,
      );
      expect(buildReport(steps).blockingPassed).toBe(false);
    },
  );

  it("rejects the Jul 15 false green even when its booleans are forged", () => {
    const { report, binding } = liveReport();
    const forged = structuredClone(report);
    const mutable = forged as unknown as {
      steps: ProductionDayStepReport[];
      blockingPassed: boolean;
    };
    mutable.steps = mutable.steps.map((step) =>
      step.id === "collect" || step.id === "clean-day-e2e"
        ? { ...step, status: "skipped", exitCode: null }
        : step,
    );
    mutable.blockingPassed = true;

    expect(
      validateLiveProductionDayReport({
        report: forged,
        binding,
        expectedDate: collectionDate,
      }),
    ).toContain("all nine required steps must exist exactly once and pass");
  });

  it("blocks mismatched persisted summary and generation job identities", () => {
    const { evidence, binding } = evidenceFixture();
    evidence.result.readerSummaryId = readerSummaryJobId;
    evidence.result.readerSummaryJobId = readerSummaryId;

    expect(
      buildReport(passedSteps(), { evidence, binding }).blockingPassed,
    ).toBe(false);
  });

  it("blocks a malformed evidence binding and wrong requested period", () => {
    const { evidence, binding } = evidenceFixture();
    const malformedBinding = {
      ...binding,
      readerSummaryId: "not-a-uuid",
      requestedUtcPeriod: productionDayUtcPeriod("2026-07-14"),
    };

    expect(
      buildReport(passedSteps(), {
        evidence,
        binding: malformedBinding,
      }).blockingPassed,
    ).toBe(false);
  });

  it.each([
    ["physicalModel", "gpt-4"],
    ["provider", "claude"],
    ["runtime", "direct"],
  ] as const)("validator rejects wrong subscription %s", (field, value) => {
    const { report, binding } = liveReport();
    const candidate = structuredClone(report);
    const mutable = candidate as unknown as {
      model: Record<string, unknown>;
    };
    mutable.model[field] = value;

    expect(
      validateLiveProductionDayReport({
        report: candidate,
        binding,
        expectedDate: collectionDate,
      }),
    ).toContain("model must exactly identify the subscription runtime");
  });

  it("validator rejects wrong topic-labeler provenance", () => {
    const { report, binding } = liveReport();
    const candidate = structuredClone(report);
    const mutable = candidate as unknown as {
      model: { topicLabeler: { runtime: string } };
    };
    mutable.model.topicLabeler.runtime = "direct";

    expect(
      validateLiveProductionDayReport({
        report: candidate,
        binding,
        expectedDate: collectionDate,
      }),
    ).toContain("model must exactly identify the subscription runtime");
  });

  it.each([true, undefined, "false"])(
    "validator rejects nonLive=%p for a live report",
    (nonLive) => {
      const { report, binding } = liveReport();
      const candidate = structuredClone(report);
      const mutable = candidate as unknown as {
        provenance: { nonLive?: unknown };
      };
      mutable.provenance.nonLive = nonLive;

      expect(
        validateLiveProductionDayReport({
          report: candidate,
          binding,
          expectedDate: collectionDate,
        }),
      ).toContain("provenance must exactly identify a live UTC production run");
    },
  );
});

function liveReport() {
  const { evidence, binding } = evidenceFixture();
  return {
    binding,
    report: buildReport(passedSteps(), { evidence, binding }),
  };
}

function buildReport(
  steps: readonly ProductionDayStepReport[],
  artifact = evidenceFixture(),
) {
  return buildProductionDayReport({
    executionMode: "live-production",
    historicalReuseProvenance: null,
    collectionDate,
    evidencePath: "/tmp/durable-reader-summary.json",
    frontendFixturePath: "/tmp/frontend-reader-summary.json",
    startedAt: new Date(`${collectionDate}T01:00:00.000Z`),
    completedAt: new Date(`${collectionDate}T01:01:00.000Z`),
    steps,
    scope: {
      tenantId: "33333333-3333-4333-8333-333333333333",
      workspaceId: "44444444-4444-4444-8444-444444444444",
    },
    collectionQuality: {
      collectionDate,
      dayWindowAudit: {
        publishedInsideWindowFeedItemCount: 10,
        providerBreakdown: [],
      },
      xAccountPool: { totalAccountCount: 1, eligibleAccountCount: 1 },
    },
    durableEvidence: artifact.evidence,
    evidenceBinding: artifact.binding,
    liveCaptureExecution: artifact.binding.captureExecution,
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
  const capture = {
    executionId: "55555555-5555-4555-8555-555555555555",
    startedAt: "2026-07-16T01:00:00.000Z",
    completedAt: "2026-07-16T01:01:00.000Z",
  };
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
      readerSummaryId,
      readerSummaryJobId,
      status: "completed",
      selectedFeedItemCount: 5,
      topReadCount: 3,
    },
    executionAttestations: productionExecutionAttestations(),
  };
  const frontendBytes = Buffer.from(`${JSON.stringify(frontend)}\n`, "utf8");
  const evidence = attachCaptureExecutionEvidence({
    evidence: rawEvidence,
    frontendArtifact: frontend,
    frontendBytes,
    capture,
    runtimeHealth: {
      status: "serving",
      runtimeEngine: "subscription-runtime-cli",
      runtimeVersion: "0.1.0-main.2",
      launcherSha256: "b".repeat(64),
      checkedAt: "2026-07-16T01:00:30.000Z",
    },
  }) as typeof rawEvidence;
  const evidenceBytes = Buffer.from(`${JSON.stringify(evidence)}\n`, "utf8");
  const inspected = inspectDurableEvidenceArtifact({
    evidence,
    evidenceBytes,
    frontendArtifact: frontend,
    frontendBytes,
    expectedDate: collectionDate,
    expectedCapture: capture,
  });
  if (inspected.binding === null) {
    throw new Error(inspected.violations.join("; "));
  }
  return { evidence, binding: inspected.binding };
}
