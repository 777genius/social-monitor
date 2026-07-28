import {
  requiredProductionDayStepIds,
  type ProductionDayStepReport,
} from "./reader-summary-production-day-collection-barrier";
import {
  buildProductionDayReport,
  type ProductionDayCollectionQuality,
  validateLiveProductionDayReport,
} from "./reader-summary-production-day-report";
import {
  attachCaptureExecutionEvidence,
  inspectDurableEvidenceArtifact,
  productionDayUtcPeriod,
} from "./reader-summary-production-day-provenance";
import { productionExecutionAttestations } from "./reader-summary-production-day-attestation.spec-support";
import type { YesterdaySocialProviderReadiness } from "./yesterday-social-collection-quality";

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

  it("passes a fresh summary regenerated from hash-bound collection evidence", () => {
    const artifact = evidenceFixture(true);
    const manifest = regenerationManifest();
    const regeneration = {
      mode: "historical-regeneration" as const,
      requestedUtcPeriod: productionDayUtcPeriod(collectionDate),
      collectionUtcPeriod: productionDayUtcPeriod(collectionDate),
      priorCollectionProof: {
        sourceAttempt: {
          artifactFormat: "reader-summary-production-day-run-v1",
          sha256: "a".repeat(64),
        },
        collectionArtifact: {
          artifactFormat: "reader-summary-clean-real-day-collection-v1",
          sha256: "b".repeat(64),
        },
        collectionQualityReport: {
          artifactFormat: "yesterday-social-collection-quality-report-v1",
          sha256: "c".repeat(64),
        },
      },
      regenerationInputManifest: manifest,
      githubOmission: {
        mode: "github_projection_unavailable_historical" as const,
        reason:
          "The exact end-of-day GitHub projection is unavailable for this completed UTC day.",
      },
      freshnessOverride: {
        mode: "historical_regeneration_current_snapshot" as const,
        generalAllowHistorical: false as const,
        maxManifestAgeSeconds: 1800 as const,
      },
    };
    const report = buildReport(
      passedSteps(),
      artifact,
      undefined,
      regeneration,
    );

    expect(report.blockingPassed).toBe(true);
    expect(report.model).toMatchObject({
      liveCollection: false,
      reusedCollection: true,
      freshSummaryCapture: true,
    });
    expect(report.qualityGates).not.toHaveProperty(
      "liveCollectionExecutedAndPassed",
    );
    expect(report.provenance).toMatchObject(regeneration);
    expect(report.qualityGates.hashBoundHistoricalRegeneration).toBe(true);
    expect(
      validateLiveProductionDayReport({
        report,
        binding: artifact.binding,
        expectedDate: collectionDate,
      }),
    ).toEqual([]);
  });

  it("persists blocked provider policy and retry timing without passing", () => {
    const providerReadiness = {
      ...completeProviderReadiness(),
      ready: false,
      policy: "blocked" as const,
      readyProviderKeys: ["rss", "x-twitter"] as const,
      blockingProviderKeys: ["hacker-news", "reddit"] as const,
      missingProviderKeys: ["hacker-news", "reddit"] as const,
      retrySchedule: {
        disposition: "scheduled" as const,
        notBefore: "2026-07-15T01:15:00.000Z",
        providerKeys: ["hacker-news", "reddit"] as const,
        reason: "blocking_provider_retry" as const,
      },
      barrierMessage:
        "Provider policy blocked 2026-07-15: hacker-news=missing; reddit=missing",
    };
    const report = buildReport(
      passedSteps(),
      evidenceFixture(),
      undefined,
      null,
      providerReadiness,
    );

    expect(report.blockingPassed).toBe(false);
    expect(report.qualityGates.providerReadinessPolicySatisfied).toBe(false);
    expect(report.providerReadiness).toEqual(providerReadiness);
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

  it("preserves snapshot dates and explicit unknown account attribution", () => {
    const collectionQuality = {
      collectionDate,
      dayWindowAudit: {
        publishedInsideWindowFeedItemCount: 10,
        providerBreakdown: [],
      },
      xAccountPool: {
        totalAccountCount: 1,
        eligibleAccountCount: 1,
        attributionStatus: "unknown",
        terminalObservationStatus: "ambiguous",
        ambiguousPassObservationCount: 1,
        rateLimitCount: 1,
        rateLimitObservationStatus: "ambiguous_legacy_uncorrelated",
        ambiguousLegacyRateLimitEventCount: 2,
        attributionPolicy: "warning_only",
        attributionGateReason:
          "unknown_attribution_global_collection_succeeded_warning_only",
        eligibleAccountZeroAttributableOutputWarningCount: 0,
        attributionWarnings: [],
        accounts: [
          {
            accountFingerprint: "account-fingerprint",
            priorityRank: 1,
            dailyRequests: 24,
            dailyTweets: 0,
            observedAccountSnapshot: {
              observedAt: "2026-07-16T00:05:00.000Z",
              dailyRequests: 24,
              dailyTweets: 0,
              counterResetDate: "2026-07-16",
              counterResetDateMatchesTargetDate: false,
            },
            targetWindowAttribution: {
              collectionDate,
              status: "unknown",
              requestDelta: null,
              tweetDelta: null,
              fetchedCount: null,
              acceptedCount: null,
              returnedCount: null,
              passSucceededCount: null,
              passFailedCount: null,
            },
          },
        ],
      },
    } satisfies ProductionDayCollectionQuality;

    const report = buildReport(
      passedSteps(),
      evidenceFixture(),
      collectionQuality,
    );

    expect(report.stats.xAccounts[0]).toMatchObject({
      dailyRequests: 24,
      dailyTweets: 0,
      passSucceededCount: null,
      passFailedCount: null,
      attributionStatus: "unknown",
      observedAccountSnapshot: {
        counterResetDate: "2026-07-16",
        counterResetDateMatchesTargetDate: false,
      },
      targetWindowAttribution: {
        collectionDate,
        status: "unknown",
        requestDelta: null,
        acceptedCount: null,
      },
    });
    expect(report.stats.xAccountAttribution).toEqual({
      status: "unknown",
      terminalObservationStatus: "ambiguous",
      ambiguousPassObservationCount: 1,
      targetRunEventCorrelationStatus: "unknown",
      ambiguousTargetRunEventCount: 0,
      rateLimitCount: 1,
      rateLimitObservationStatus: "ambiguous_legacy_uncorrelated",
      ambiguousLegacyRateLimitEventCount: 2,
      policy: "warning_only",
      gateReason:
        "unknown_attribution_global_collection_succeeded_warning_only",
      warningCount: 0,
      warnings: [],
    });
  });

  it("persists pool-level attribution warnings in durable stats", () => {
    const warning = {
      code: "eligible_account_requests_without_attributable_output",
      accountFingerprint: "account-fingerprint",
    };
    const report = buildReport(passedSteps(), evidenceFixture(), {
      collectionDate,
      dayWindowAudit: {
        publishedInsideWindowFeedItemCount: 10,
        providerBreakdown: [],
      },
      xAccountPool: {
        totalAccountCount: 2,
        eligibleAccountCount: 2,
        attributionStatus: "known",
        attributionPolicy: "warning_only",
        attributionGateReason: "known_attribution_zero_output_warning_only",
        eligibleAccountZeroAttributableOutputWarningCount: 1,
        attributionWarnings: [warning],
      },
    });

    expect(report.stats.xAccountAttribution).toEqual({
      status: "known",
      terminalObservationStatus: "unambiguous",
      ambiguousPassObservationCount: 0,
      targetRunEventCorrelationStatus: "unknown",
      ambiguousTargetRunEventCount: 0,
      rateLimitCount: 0,
      rateLimitObservationStatus: "unambiguous",
      ambiguousLegacyRateLimitEventCount: 0,
      policy: "warning_only",
      gateReason: "known_attribution_zero_output_warning_only",
      warningCount: 1,
      warnings: [warning],
    });
  });

  it("normalizes partial nested X account attribution per field", () => {
    const report = buildReport(passedSteps(), evidenceFixture(), {
      collectionDate,
      dayWindowAudit: {
        publishedInsideWindowFeedItemCount: 10,
        providerBreakdown: [],
      },
      xAccountPool: {
        totalAccountCount: 1,
        eligibleAccountCount: 1,
        attributionStatus: "partial",
        attributionPolicy: "warning_only",
        attributionGateReason:
          "partial_attribution_global_collection_succeeded_warning_only",
        eligibleAccountZeroAttributableOutputWarningCount: 0,
        attributionWarnings: [],
        accounts: [
          {
            accountFingerprint: "account-fingerprint",
            priorityRank: 1,
            dailyRequests: 24,
            dailyTweets: 5,
            lastResetDate: "2026-07-16",
            observedAccountSnapshot: {
              observedAt: "2026-07-16T00:05:00.000Z",
            },
            targetWindowAttribution: {
              status: "partial",
              requestDelta: 2,
            },
          },
        ],
      },
    });

    expect(report.stats.xAccounts[0]?.observedAccountSnapshot).toStrictEqual({
      observedAt: "2026-07-16T00:05:00.000Z",
      dailyRequests: 24,
      dailyTweets: 5,
      counterResetDate: "2026-07-16",
      counterResetDateMatchesTargetDate: false,
    });
    expect(report.stats.xAccounts[0]?.targetWindowAttribution).toStrictEqual({
      collectionDate: undefined,
      status: "partial",
      terminalObservationStatus: "unambiguous",
      ambiguousPassObservationCount: 0,
      requestDelta: 2,
      tweetDelta: null,
      fetchedCount: null,
      acceptedCount: null,
      returnedCount: null,
      passSucceededCount: null,
      passFailedCount: null,
    });
  });

  it("keeps missing legacy account counters nullable", () => {
    const report = buildReport(passedSteps(), evidenceFixture(), {
      collectionDate,
      dayWindowAudit: {
        publishedInsideWindowFeedItemCount: 10,
        providerBreakdown: [],
      },
      xAccountPool: {
        totalAccountCount: 1,
        eligibleAccountCount: 0,
        attributionStatus: "unknown",
        attributionPolicy: "warning_only",
        attributionGateReason:
          "unknown_attribution_global_collection_succeeded_warning_only",
        eligibleAccountZeroAttributableOutputWarningCount: 0,
        attributionWarnings: [],
        accounts: [
          {
            accountFingerprint: "legacy-account",
            priorityRank: 1,
          },
        ],
      },
    });

    expect(report.stats.xAccounts[0]).toMatchObject({
      dailyRequests: null,
      dailyTweets: null,
      observedAccountSnapshot: {
        dailyRequests: null,
        dailyTweets: null,
      },
      targetWindowAttribution: {
        status: "unknown",
        fetchedCount: null,
        acceptedCount: null,
      },
    });
  });

  it.each([
    ["status", undefined],
    ["status", "future"],
    ["terminalObservationStatus", "future"],
    ["ambiguousPassObservationCount", -1],
    ["targetRunEventCorrelationStatus", "future"],
    ["ambiguousTargetRunEventCount", -1],
    ["rateLimitCount", 0.5],
    ["rateLimitObservationStatus", "future"],
    ["ambiguousLegacyRateLimitEventCount", -1],
    ["policy", undefined],
    ["policy", "blocking"],
    ["gateReason", undefined],
    ["gateReason", "   "],
    ["warningCount", undefined],
    ["warningCount", 0.5],
    ["warnings", undefined],
    ["warnings", {}],
  ] as const)(
    "validator rejects an incomplete attribution contract with %s=%p",
    (field, value) => {
      const { report, binding } = liveReport();
      const candidate = structuredClone(report);
      const mutable = candidate as unknown as {
        stats: { xAccountAttribution: Record<string, unknown> };
      };
      mutable.stats.xAccountAttribution[field] = value;

      expect(
        validateLiveProductionDayReport({
          report: candidate,
          binding,
          expectedDate: collectionDate,
        }),
      ).toContain(
        "stats.xAccountAttribution must contain a complete warning-only attribution contract",
      );
    },
  );

  it("validator rejects an attribution warning count inconsistent with warnings", () => {
    const { report, binding } = liveReport();
    const candidate = structuredClone(report);
    const mutable = candidate as unknown as {
      stats: { xAccountAttribution: { warningCount: number } };
    };
    mutable.stats.xAccountAttribution.warningCount = 1;

    expect(
      validateLiveProductionDayReport({
        report: candidate,
        binding,
        expectedDate: collectionDate,
      }),
    ).toContain(
      "stats.xAccountAttribution must contain a complete warning-only attribution contract",
    );
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
  collectionQuality: ProductionDayCollectionQuality | undefined = undefined,
  historicalRegenerationProvenance: Parameters<
    typeof buildProductionDayReport
  >[0]["historicalRegenerationProvenance"] = null,
  providerReadiness: YesterdaySocialProviderReadiness =
    completeProviderReadiness(),
) {
  const resolvedCollectionQuality: ProductionDayCollectionQuality =
    collectionQuality ?? {
      collectionDate,
      dayWindowAudit: {
        publishedInsideWindowFeedItemCount: 10,
        providerBreakdown: [],
      },
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
    };
  return buildProductionDayReport({
    executionMode:
      historicalRegenerationProvenance === null
        ? "live-production"
        : "historical-regeneration",
    historicalReuseProvenance: null,
    historicalRegenerationProvenance,
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
    providerReadiness,
    collectionQuality: resolvedCollectionQuality,
    durableEvidence: artifact.evidence,
    evidenceBinding: artifact.binding,
    liveCaptureExecution: artifact.binding.captureExecution,
    allowDegraded: false,
    allowHistorical: false,
    failure: null,
  });
}

function completeProviderReadiness(): YesterdaySocialProviderReadiness {
  return {
    ready: true,
    policy: "complete",
    collectionDate,
    requiredProviderKeys: [],
    providerStates: [],
    readyProviderKeys: [],
    blockingProviderKeys: [],
    missingProviderKeys: [],
    duplicateProviderKeys: [],
    emptyProviderKeys: [],
    partialProviderKeys: [],
    unavailableProviderKeys: [],
    retrySchedule: null,
    barrierMessage: null,
  };
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

function evidenceFixture(withDatasetGuard = false) {
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
      ...(withDatasetGuard ? { datasetManifest: datasetGuardEvidence() } : {}),
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

function regenerationManifest() {
  return {
    artifactFormat: "reader-summary-day-dataset-manifest-v1",
    sha256: "d".repeat(64),
    generatedAt: "2026-07-16T00:59:00.000Z",
    datasetSha256: "e".repeat(64),
    feedRowCount: 10,
    githubEligibilityRowCount: 1,
    providerCounts: { reddit: 10 },
  };
}

function datasetGuardEvidence() {
  const manifest = regenerationManifest();
  return {
    manifestFormat: manifest.artifactFormat,
    manifestFileSha256: manifest.sha256,
    manifestGeneratedAt: manifest.generatedAt,
    datasetSha256: manifest.datasetSha256,
    feedRowCount: manifest.feedRowCount,
    githubEligibilityRowCount: manifest.githubEligibilityRowCount,
    providerCounts: manifest.providerCounts,
    completedPhases: [
      "before_evidence_selection",
      "after_evidence_selection",
      "before_publication",
    ],
  };
}
