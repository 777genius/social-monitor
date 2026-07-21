import { createHash } from "node:crypto";

import { noRawSecretFragments } from "./yesterday-social-replay-support";
import {
  exactProductionDayStepsPassed,
  type ProductionDayStepReport,
} from "./reader-summary-production-day-collection-barrier";
import {
  captureExecutionMatches,
  durableEvidenceBindingEqual,
  isProductionSubscriptionRuntimeProvenance,
  periodsEqual,
  isRecord,
  productionDayReportArtifactFormat,
  productionDayReportGeneratedBy,
  productionDayReportIdentity,
  productionDayUtcPeriod,
  reportIdentityMatches,
  runtimeProvenanceEqual,
  summaryBindingMatches,
  type DurableEvidenceBinding,
  type ProductionDayCaptureExecution,
  type ProductionDayRuntimeProvenance,
  type ProductionDayUtcPeriod,
} from "./reader-summary-production-day-provenance";
import type { HistoricalRegenerationSourceProvenance } from "./reader-summary-production-day-regeneration";
import {
  buildHistoricalRegenerationProvenance,
  regenerationDatasetGuardMatches,
  validHistoricalRegenerationProvenance,
} from "./reader-summary-production-day-regeneration-report";

export type HistoricalReuseProvenance = {
  readonly mode: "historical-reuse";
  readonly nonLive: true;
  readonly requestedUtcPeriod: ProductionDayUtcPeriod;
  readonly collectionUtcPeriod: ProductionDayUtcPeriod;
  readonly sourceReport: {
    readonly artifactId: string;
    readonly sha256: string;
  };
  readonly sourceEvidence: DurableEvidenceBinding;
};

export type ProductionDayCollectionQuality = {
  readonly collectionDate?: string;
  readonly dayWindowAudit?: {
    readonly publishedInsideWindowFeedItemCount?: number;
    readonly observedButPublishedOutsideWindowFeedItemCount?: number;
    readonly duplicateFeedItemCount?: number;
    readonly lowRelevanceFeedItemCount?: number;
    readonly summaryCandidateFeedItemCount?: number;
    readonly providerBreakdown?: readonly {
      readonly providerKey: string;
      readonly publishedInsideWindowFeedItemCount?: number;
    }[];
  };
  readonly xAccountPool?: {
    readonly totalAccountCount?: number;
    readonly eligibleAccountCount?: number;
    readonly eventCount?: number;
    readonly targetRunEventCorrelationStatus?:
      | "exact"
      | "ambiguous"
      | "unknown";
    readonly ambiguousTargetRunEventCount?: number;
    readonly attributionStatus?: "known" | "partial" | "unknown";
    readonly terminalObservationStatus?: "unambiguous" | "ambiguous";
    readonly ambiguousPassObservationCount?: number;
    readonly rateLimitCount?: number;
    readonly rateLimitObservationStatus?:
      | "unambiguous"
      | "ambiguous_legacy_uncorrelated";
    readonly ambiguousLegacyRateLimitEventCount?: number;
    readonly attributionPolicy?: "warning_only";
    readonly attributionGateReason?: string;
    readonly eligibleAccountZeroAttributableOutputWarningCount?: number;
    readonly attributionWarnings?: readonly {
      readonly code: string;
      readonly accountFingerprint: string;
    }[];
    readonly accounts?: readonly ProductionDayXAccount[];
  };
};

type ProductionDayXAccount = {
  readonly accountFingerprint?: string;
  readonly priorityRank?: number;
  readonly prioritySource?: string;
  readonly eligible?: boolean;
  readonly ineligibilityReasonCodes?: readonly string[];
  readonly dailyRequests?: number | null;
  readonly dailyTweets?: number | null;
  readonly lastResetDate?: string | null;
  readonly attributionStatus?: "known" | "partial" | "unknown";
  readonly terminalObservationStatus?: "unambiguous" | "ambiguous";
  readonly ambiguousPassObservationCount?: number;
  readonly passSucceededCount?: number | null;
  readonly passFailedCount?: number | null;
  readonly rateLimitCount?: number;
  readonly cooldownObservedCount?: number;
  readonly lastUsedAt?: string | null;
  readonly cooldownUntil?: string | null;
  readonly observedAccountSnapshot?: {
    readonly observedAt?: string;
    readonly dailyRequests?: number | null;
    readonly dailyTweets?: number | null;
    readonly counterResetDate?: string | null;
    readonly counterResetDateMatchesTargetDate?: boolean;
  };
  readonly targetWindowAttribution?: {
    readonly collectionDate?: string;
    readonly status?: "known" | "partial" | "unknown";
    readonly terminalObservationStatus?: "unambiguous" | "ambiguous";
    readonly ambiguousPassObservationCount?: number;
    readonly requestDelta?: number | null;
    readonly tweetDelta?: number | null;
    readonly fetchedCount?: number | null;
    readonly acceptedCount?: number | null;
    readonly returnedCount?: number | null;
    readonly passSucceededCount?: number | null;
    readonly passFailedCount?: number | null;
  };
};

export type ProductionDayDurableEvidence = {
  readonly artifactId?: string;
  readonly period?: unknown;
  readonly provenance?: unknown;
  readonly result?: {
    readonly readerSummaryId?: string;
    readonly readerSummaryJobId?: string;
    readonly headline?: string;
    readonly selectedFeedItemCount?: number;
    readonly topReadCount?: number;
  };
};

export type ProductionDayReport = ReturnType<typeof buildProductionDayReport>;

export function buildProductionDayReport(params: {
  readonly executionMode:
    "live-production" | "historical-regeneration" | "historical-reuse";
  readonly historicalReuseProvenance: HistoricalReuseProvenance | null;
  readonly historicalRegenerationProvenance: HistoricalRegenerationSourceProvenance | null;
  readonly collectionDate: string;
  readonly evidencePath: string;
  readonly frontendFixturePath: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly steps: readonly ProductionDayStepReport[];
  readonly scope: { readonly tenantId: string; readonly workspaceId: string };
  readonly collectionQuality: ProductionDayCollectionQuality | null;
  readonly durableEvidence: ProductionDayDurableEvidence | null;
  readonly evidenceBinding: DurableEvidenceBinding | null;
  readonly liveCaptureExecution: ProductionDayCaptureExecution | null;
  readonly allowDegraded: boolean;
  readonly allowHistorical: boolean;
  readonly failure: {
    readonly code: "collection_quality_failed";
    readonly safeMessage: string;
  } | null;
}) {
  const expectedPeriod = productionDayUtcPeriod(params.collectionDate);
  const writesProductionData = params.executionMode !== "historical-reuse";
  const liveCollection = params.executionMode === "live-production";
  const reusedCollection = params.executionMode !== "live-production";
  const freshSummaryCapture = params.executionMode !== "historical-reuse";
  const summary = buildSummary(params.durableEvidence, params.evidenceBinding);
  const reportIdentity =
    params.evidenceBinding === null ||
    !periodsEqual(params.evidenceBinding.requestedUtcPeriod, expectedPeriod)
      ? null
      : productionDayReportIdentity({
          collectionDate: params.collectionDate,
          binding: params.evidenceBinding,
        });
  const provenance = resolveProvenance({
    executionMode: params.executionMode,
    expectedPeriod,
    historicalReuseProvenance: params.historicalReuseProvenance,
    historicalRegenerationProvenance: params.historicalRegenerationProvenance,
    durableEvidence: params.durableEvidence,
    evidenceBinding: params.evidenceBinding,
  });
  const exactStepsPassed = exactProductionDayStepsPassed(params.steps);
  const durableEvidenceMatchesBinding =
    params.evidenceBinding !== null &&
    params.durableEvidence?.artifactId === params.evidenceBinding.artifactId &&
    params.durableEvidence.result?.readerSummaryId ===
      params.evidenceBinding.readerSummaryId &&
    params.durableEvidence.result?.readerSummaryJobId ===
      params.evidenceBinding.readerSummaryJobId &&
    periodsEqual(
      params.durableEvidence.period,
      params.evidenceBinding.requestedUtcPeriod,
    );
  const evidenceBound =
    durableEvidenceMatchesBinding &&
    params.evidenceBinding !== null &&
    summaryBindingMatches({ summary, binding: params.evidenceBinding }) &&
    reportIdentityMatches({
      reportIdentity,
      collectionDate: params.collectionDate,
      binding: params.evidenceBinding,
    });
  const liveCaptureBound =
    freshSummaryCapture &&
    params.evidenceBinding !== null &&
    params.liveCaptureExecution !== null &&
    captureExecutionMatches(
      params.evidenceBinding.captureExecution,
      params.liveCaptureExecution,
    );
  const runtimeProvenance = params.evidenceBinding?.runtimeProvenance ?? null;
  const runtimeProvenanceValid =
    runtimeProvenance !== null &&
    isProductionSubscriptionRuntimeProvenance(runtimeProvenance);
  const provenanceValid = provenanceMatches({
    provenance,
    executionMode: params.executionMode,
    expectedPeriod,
    evidenceBinding: params.evidenceBinding,
  });
  const regenerationProvenanceValid =
    params.executionMode !== "historical-regeneration" ||
    (params.historicalRegenerationProvenance !== null && provenanceValid);
  const regenerationDatasetGuardValid =
    params.executionMode !== "historical-regeneration" ||
    regenerationDatasetGuardMatches({
      evidence: params.durableEvidence,
      provenance: params.historicalRegenerationProvenance,
    });
  const historicalEvaluationPassed = historicalReuseEvaluationPassed({
    liveProduction: writesProductionData,
    steps: params.steps,
    provenanceValid,
    evidenceBound,
  });
  const qualityGates = {
    exactRequiredStepsExecutedOnceAndPassed: exactStepsPassed,
    allRequiredStepsPassed: exactStepsPassed,
    degradedFailuresAreExplicitlyAllowed: exactStepsPassed,
    collectionQualityReported:
      params.collectionQuality?.dayWindowAudit
        ?.publishedInsideWindowFeedItemCount !== undefined,
    collectionQualityDateMatchesRequestedDate:
      params.collectionQuality?.collectionDate === params.collectionDate,
    durableSummaryCaptured:
      params.durableEvidence?.result?.selectedFeedItemCount !== undefined,
    durableSummaryPersistedAndUuidBound: evidenceBound && liveCaptureBound,
    durableSummaryWindowMatchesRequestedDate:
      params.durableEvidence !== null &&
      periodsEqual(params.durableEvidence.period, expectedPeriod),
    evidenceArtifactContentHashBound: evidenceBound,
    freshEvidenceAndFrontendArtifactsHashBound:
      evidenceBound && liveCaptureBound,
    xAccountPoolReported:
      params.collectionQuality?.xAccountPool?.totalAccountCount !== undefined &&
      params.collectionQuality.xAccountPool.eligibleAccountCount !== undefined,
    reportDateMatchesRequestedDate:
      params.collectionDate === expectedPeriod.startedAt.slice(0, 10),
    reportUtcWindowMatchesRequestedDate: provenanceValid,
    collectionInputProvenanceSatisfied:
      (liveCollection && exactStepsPassed) ||
      (params.executionMode === "historical-regeneration" &&
        regenerationProvenanceValid &&
        regenerationDatasetGuardValid &&
        requiredStepPassed(params.steps, "collect")),
    cleanDayE2eExecutedAndPassed:
      writesProductionData && requiredStepPassed(params.steps, "clean-day-e2e"),
    productionDefinitionOfDoneSatisfied:
      writesProductionData &&
      exactStepsPassed &&
      evidenceBound &&
      liveCaptureBound &&
      regenerationDatasetGuardValid,
    strictLiveProductionControls:
      writesProductionData && !params.allowDegraded && !params.allowHistorical,
    subscriptionRuntimeProvenanceVerified:
      writesProductionData && evidenceBound && runtimeProvenanceValid,
    topicLabelerProvenanceVerified:
      writesProductionData &&
      evidenceBound &&
      runtimeProvenanceValid &&
      runtimeProvenance !== null &&
      (runtimeProvenance.execution === "not_executed" ||
        runtimeProvenance.topicLabeler.mode === "agent-runtime"),
    provenanceMatchesExecutionMode: provenanceValid,
    hashBoundHistoricalRegeneration: regenerationProvenanceValid,
    regenerationDatasetGuardVerified: regenerationDatasetGuardValid,
    historicalReuseEvaluationPassed: historicalEvaluationPassed,
    noRawSecretFragments: true,
    productionFailureAbsent: params.failure === null,
  };
  const reportWithoutSecretGate = {
    schemaVersion: 1 as const,
    artifactFormat: productionDayReportArtifactFormat,
    generatedBy: productionDayReportGeneratedBy,
    requestedDate: params.collectionDate,
    collectionDate: params.collectionDate,
    reportIdentity,
    provenance,
    model: {
      liveCollection,
      reusedCollection,
      freshSummaryCapture,
      ...runtimeModelFields(runtimeProvenance),
      writesProductionData,
      allowDegraded: params.allowDegraded,
      allowHistorical: params.allowHistorical,
      rawProviderPayloadPersistedInReport: false as const,
      rawPostTextPersistedInReport: false as const,
    },
    inputs: {
      periodStartedAt: expectedPeriod.startedAt,
      periodEndedAt: expectedPeriod.endedAt,
      timezone: expectedPeriod.timezone,
      periodKey: expectedPeriod.periodKey,
      tenantFingerprint: shortFingerprint(params.scope.tenantId),
      workspaceFingerprint: shortFingerprint(params.scope.workspaceId),
      evidenceArtifactId: params.evidenceBinding?.artifactId ?? null,
      frontendArtifactFormat:
        params.evidenceBinding?.captureExecution.frontendArtifactFormat ?? null,
    },
    run: {
      startedAt: params.startedAt.toISOString(),
      completedAt: params.completedAt.toISOString(),
      captureExecution: params.liveCaptureExecution,
    },
    failure: params.failure,
    summary,
    steps: params.steps,
    stats: buildStats(params.collectionQuality, params.durableEvidence),
    qualityGates,
    blockingPassed: false,
  };
  const finalQualityGates = {
    ...qualityGates,
    noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
  };

  return {
    ...reportWithoutSecretGate,
    qualityGates: finalQualityGates,
    blockingPassed:
      writesProductionData && Object.values(finalQualityGates).every(Boolean),
  };
}

export function validateLiveProductionDayReport(params: {
  readonly report: unknown;
  readonly binding: DurableEvidenceBinding;
  readonly expectedDate: string;
}): readonly string[] {
  const violations: string[] = [];
  const expectedPeriod = productionDayUtcPeriod(params.expectedDate);
  if (!isRecord(params.report)) {
    return ["source report must be an object"];
  }
  const report = params.report;
  requireReportEqual(report.schemaVersion, 1, "schemaVersion", violations);
  requireReportEqual(
    report.artifactFormat,
    productionDayReportArtifactFormat,
    "artifactFormat",
    violations,
  );
  requireReportEqual(
    report.generatedBy,
    productionDayReportGeneratedBy,
    "generatedBy",
    violations,
  );
  requireReportEqual(
    report.requestedDate,
    params.expectedDate,
    "requestedDate",
    violations,
  );
  requireReportEqual(
    report.collectionDate,
    params.expectedDate,
    "collectionDate",
    violations,
  );
  requireReportEqual(report.failure, null, "failure", violations);
  requireReportEqual(report.blockingPassed, true, "blockingPassed", violations);

  if (
    !validSubscriptionRuntimeModel(
      report.model,
      params.binding,
      report.provenance,
    )
  ) {
    violations.push("model must exactly identify the subscription runtime");
  }
  if (!validLiveProvenance(report.provenance, expectedPeriod, params.binding)) {
    violations.push(
      "provenance must exactly identify a live UTC production run",
    );
  }
  if (!validInputs(report.inputs, expectedPeriod)) {
    violations.push("inputs must exactly identify the requested UTC period");
  }
  if (!validRunCapture(report.run, params.binding)) {
    violations.push("run must exactly identify the fresh capture execution");
  }
  if (
    !summaryBindingMatches({ summary: report.summary, binding: params.binding })
  ) {
    violations.push(
      "summary must exactly match the persisted evidence binding",
    );
  }
  if (
    !reportIdentityMatches({
      reportIdentity: report.reportIdentity,
      collectionDate: params.expectedDate,
      binding: params.binding,
    })
  ) {
    violations.push("report identity must exactly match the persisted summary");
  }
  if (!validExactSteps(report.steps)) {
    violations.push("all nine required steps must exist exactly once and pass");
  }
  if (!allQualityGatesPass(report.qualityGates)) {
    violations.push("all quality gates must exist and pass");
  }
  if (!validXAccountAttributionContract(report.stats)) {
    violations.push(
      "stats.xAccountAttribution must contain a complete warning-only attribution contract",
    );
  }
  return violations;
}

function buildSummary(
  evidence: ProductionDayDurableEvidence | null,
  binding: DurableEvidenceBinding | null,
) {
  return {
    evidenceArtifactId: binding?.artifactId ?? null,
    evidenceArtifactSha256: binding?.sha256 ?? null,
    evidenceArtifactByteLength: binding?.byteLength ?? null,
    requestedUtcPeriod: binding?.requestedUtcPeriod ?? null,
    readerSummaryId: binding?.readerSummaryId ?? null,
    readerSummaryJobId: binding?.readerSummaryJobId ?? null,
    captureExecution: binding?.captureExecution ?? null,
    runtimeProvenance: binding?.runtimeProvenance ?? null,
    headline: evidence?.result?.headline ?? null,
  };
}

function runtimeModelFields(provenance: ProductionDayRuntimeProvenance | null) {
  if (provenance === null || provenance.execution === "not_executed") {
    return {
      runtimeExecution: provenance?.execution ?? null,
      runtimeExecutionReason: provenance?.reason ?? null,
      summaryModel: null,
      physicalModel: null,
      provider: null,
      runtime: null,
      runtimeVersion: null,
      reasoningEffort: null,
      launcherSha256: null,
      summaryContentSha256: null,
      topicMapSha256: null,
      attestationSetSha256: null,
      completedTaskCount: 0,
      topicLabeler: null,
    };
  }
  return {
    runtimeExecution: provenance.execution,
    runtimeExecutionReason: null,
    summaryModel: provenance.summaryModel,
    physicalModel: provenance.physicalModel,
    provider: provenance.provider,
    runtime: provenance.runtime,
    runtimeVersion: provenance.runtimeVersion,
    reasoningEffort: provenance.reasoningEffort,
    launcherSha256: provenance.launcherSha256,
    summaryContentSha256: provenance.summaryContentSha256,
    topicMapSha256: provenance.topicMapSha256,
    attestationSetSha256: provenance.attestationSetSha256,
    completedTaskCount: provenance.completedTaskCount,
    topicLabeler: provenance.topicLabeler,
  };
}

function resolveProvenance(params: {
  readonly executionMode:
    "live-production" | "historical-regeneration" | "historical-reuse";
  readonly expectedPeriod: ProductionDayUtcPeriod;
  readonly historicalReuseProvenance: HistoricalReuseProvenance | null;
  readonly historicalRegenerationProvenance: HistoricalRegenerationSourceProvenance | null;
  readonly durableEvidence: ProductionDayDurableEvidence | null;
  readonly evidenceBinding: DurableEvidenceBinding | null;
}) {
  if (params.executionMode === "historical-reuse") {
    if (params.historicalReuseProvenance === null) {
      throw new Error("Historical reuse requires immutable provenance");
    }
    return params.historicalReuseProvenance;
  }
  if (params.historicalReuseProvenance !== null) {
    throw new Error("Live production cannot carry historical reuse provenance");
  }
  if (params.historicalRegenerationProvenance !== null) {
    return buildHistoricalRegenerationProvenance({
      source: params.historicalRegenerationProvenance,
      durableEvidence: params.durableEvidence,
      evidenceBinding: params.evidenceBinding,
    });
  }
  return {
    mode: "live-production" as const,
    nonLive: false as const,
    requestedUtcPeriod: params.expectedPeriod,
    collectionUtcPeriod: params.expectedPeriod,
    sourceReport: null,
    sourceEvidence: params.evidenceBinding,
  };
}

function provenanceMatches(params: {
  readonly provenance: ReturnType<typeof resolveProvenance>;
  readonly executionMode:
    "live-production" | "historical-regeneration" | "historical-reuse";
  readonly expectedPeriod: ProductionDayUtcPeriod;
  readonly evidenceBinding: DurableEvidenceBinding | null;
}): boolean {
  const windowsMatch =
    periodsEqual(params.provenance.requestedUtcPeriod, params.expectedPeriod) &&
    periodsEqual(params.provenance.collectionUtcPeriod, params.expectedPeriod);
  if (params.executionMode !== "historical-reuse") {
    if (params.executionMode === "historical-regeneration") {
      return (
        windowsMatch &&
        validHistoricalRegenerationProvenance({
          value: params.provenance,
          expectedPeriod: params.expectedPeriod,
          evidenceBinding: params.evidenceBinding,
        })
      );
    }
    return (
      params.provenance.mode === "live-production" &&
      params.provenance.nonLive === false &&
      params.provenance.sourceReport === null &&
      params.evidenceBinding !== null &&
      params.provenance.sourceEvidence === params.evidenceBinding &&
      windowsMatch
    );
  }
  return (
    params.provenance.mode === "historical-reuse" &&
    params.provenance.nonLive === true &&
    params.evidenceBinding !== null &&
    params.provenance.sourceEvidence.sha256 === params.evidenceBinding.sha256 &&
    params.provenance.sourceEvidence.artifactId ===
      params.evidenceBinding.artifactId &&
    windowsMatch
  );
}

function historicalReuseEvaluationPassed(params: {
  readonly liveProduction: boolean;
  readonly steps: readonly ProductionDayStepReport[];
  readonly provenanceValid: boolean;
  readonly evidenceBound: boolean;
}): boolean {
  if (params.liveProduction) {
    return true;
  }
  return (
    params.provenanceValid &&
    params.evidenceBound &&
    params.steps.every((step) =>
      step.id === "collect" || step.id === "durable-reader-summary"
        ? step.status === "skipped" && step.exitCode === null
        : step.status === "passed" && step.exitCode === 0,
    )
  );
}

function requiredStepPassed(
  steps: readonly ProductionDayStepReport[],
  id: string,
): boolean {
  const matches = steps.filter((step) => step.id === id);
  return (
    matches.length === 1 &&
    matches[0]?.status === "passed" &&
    matches[0].exitCode === 0
  );
}

function buildStats(
  collectionQuality: ProductionDayCollectionQuality | null,
  evidence: ProductionDayDurableEvidence | null,
) {
  const audit = collectionQuality?.dayWindowAudit;
  const pool = collectionQuality?.xAccountPool;
  return {
    collectedFeedItemCount: audit?.publishedInsideWindowFeedItemCount ?? null,
    publishedInsideWindowFeedItemCount:
      audit?.publishedInsideWindowFeedItemCount ?? null,
    observedButPublishedOutsideWindowFeedItemCount:
      audit?.observedButPublishedOutsideWindowFeedItemCount ?? null,
    duplicateFeedItemCount: audit?.duplicateFeedItemCount ?? null,
    lowRelevanceFeedItemCount: audit?.lowRelevanceFeedItemCount ?? null,
    summaryCandidateFeedItemCount: audit?.summaryCandidateFeedItemCount ?? null,
    selectedFeedItemCount: evidence?.result?.selectedFeedItemCount ?? null,
    topReadCount: evidence?.result?.topReadCount ?? null,
    providerCounts: Object.fromEntries(
      audit?.providerBreakdown?.map((provider) => [
        provider.providerKey,
        provider.publishedInsideWindowFeedItemCount ?? 0,
      ]) ?? [],
    ),
    xAccountCount: pool?.totalAccountCount ?? null,
    xAccountTotalCount: pool?.totalAccountCount ?? null,
    xAccountEligibleCount: pool?.eligibleAccountCount ?? null,
    xAccountUsageEventCount: pool?.eventCount ?? null,
    xAccountAttribution: {
      status: pool?.attributionStatus ?? "unknown",
      terminalObservationStatus:
        pool?.terminalObservationStatus ?? "unambiguous",
      ambiguousPassObservationCount:
        pool?.ambiguousPassObservationCount ?? 0,
      targetRunEventCorrelationStatus:
        pool?.targetRunEventCorrelationStatus ?? "unknown",
      ambiguousTargetRunEventCount:
        pool?.ambiguousTargetRunEventCount ?? 0,
      rateLimitCount: pool?.rateLimitCount ?? 0,
      rateLimitObservationStatus:
        pool?.rateLimitObservationStatus ?? "unambiguous",
      ambiguousLegacyRateLimitEventCount:
        pool?.ambiguousLegacyRateLimitEventCount ?? 0,
      policy: pool?.attributionPolicy ?? "warning_only",
      gateReason:
        pool?.attributionGateReason ?? "attribution_not_reported_warning_only",
      warningCount:
        pool?.eligibleAccountZeroAttributableOutputWarningCount ?? null,
      warnings: pool?.attributionWarnings ?? [],
    },
    xAccounts:
      pool?.accounts?.flatMap((account) =>
        account.accountFingerprint === undefined ||
        account.priorityRank === undefined
          ? []
          : [normalizedXAccount(account)],
      ) ?? [],
  };
}

function normalizedXAccount(account: ProductionDayXAccount) {
  const observedAccountSnapshot = {
    observedAt: account.observedAccountSnapshot?.observedAt,
    dailyRequests:
      account.observedAccountSnapshot?.dailyRequests ??
      account.dailyRequests ??
      null,
    dailyTweets:
      account.observedAccountSnapshot?.dailyTweets ??
      account.dailyTweets ??
      null,
    counterResetDate:
      account.observedAccountSnapshot?.counterResetDate ??
      account.lastResetDate ??
      null,
    counterResetDateMatchesTargetDate:
      account.observedAccountSnapshot?.counterResetDateMatchesTargetDate ??
      false,
  };
  const targetWindowAttribution = {
    collectionDate: account.targetWindowAttribution?.collectionDate,
    status:
      account.targetWindowAttribution?.status ??
      account.attributionStatus ??
      ("unknown" as const),
    terminalObservationStatus:
      account.targetWindowAttribution?.terminalObservationStatus ??
      account.terminalObservationStatus ??
      ("unambiguous" as const),
    ambiguousPassObservationCount:
      account.targetWindowAttribution?.ambiguousPassObservationCount ??
      account.ambiguousPassObservationCount ??
      0,
    requestDelta: account.targetWindowAttribution?.requestDelta ?? null,
    tweetDelta: account.targetWindowAttribution?.tweetDelta ?? null,
    fetchedCount: account.targetWindowAttribution?.fetchedCount ?? null,
    acceptedCount: account.targetWindowAttribution?.acceptedCount ?? null,
    returnedCount: account.targetWindowAttribution?.returnedCount ?? null,
    passSucceededCount:
      account.targetWindowAttribution?.passSucceededCount ?? null,
    passFailedCount: account.targetWindowAttribution?.passFailedCount ?? null,
  };

  return {
    accountFingerprint: account.accountFingerprint as string,
    priorityRank: account.priorityRank as number,
    prioritySource: account.prioritySource ?? "unknown",
    eligible: account.eligible === true,
    ineligibilityReasonCodes: account.ineligibilityReasonCodes ?? [],
    dailyRequests: account.dailyRequests ?? null,
    dailyTweets: account.dailyTweets ?? null,
    lastResetDate: account.lastResetDate ?? null,
    passSucceededCount: account.passSucceededCount ?? null,
    passFailedCount: account.passFailedCount ?? null,
    rateLimitCount: account.rateLimitCount ?? 0,
    cooldownObservedCount: account.cooldownObservedCount ?? 0,
    lastUsedAt: account.lastUsedAt ?? null,
    cooldownUntil: account.cooldownUntil ?? null,
    attributionStatus: targetWindowAttribution.status ?? "unknown",
    observedAccountSnapshot,
    targetWindowAttribution,
  };
}

function shortFingerprint(value: string): string {
  // Fingerprints are report-safe scope correlation identifiers, not identities.
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function validSubscriptionRuntimeModel(
  value: unknown,
  binding: DurableEvidenceBinding,
  provenance: unknown,
): boolean {
  if (
    !isRecord(value) ||
    !isProductionSubscriptionRuntimeProvenance(binding.runtimeProvenance)
  ) {
    return false;
  }
  const mode = isRecord(provenance) ? provenance.mode : null;
  const executionFlagsMatch =
    (mode === "live-production" &&
      value.liveCollection === true &&
      value.reusedCollection === false &&
      value.freshSummaryCapture === true) ||
    (mode === "historical-regeneration" &&
      value.liveCollection === false &&
      value.reusedCollection === true &&
      value.freshSummaryCapture === true);
  return (
    executionFlagsMatch &&
    runtimeModelIdentityMatches(value, binding.runtimeProvenance) &&
    value.writesProductionData === true &&
    value.allowDegraded === false &&
    value.allowHistorical === false &&
    value.rawProviderPayloadPersistedInReport === false &&
    value.rawPostTextPersistedInReport === false
  );
}

function runtimeModelIdentityMatches(
  value: Record<string, unknown>,
  provenance: ProductionDayRuntimeProvenance,
): boolean {
  if (provenance.execution === "not_executed") {
    return (
      value.runtimeExecution === provenance.execution &&
      value.runtimeExecutionReason === provenance.reason &&
      value.summaryModel === null &&
      value.physicalModel === null &&
      value.provider === null &&
      value.runtime === null &&
      value.runtimeVersion === null &&
      value.reasoningEffort === null &&
      value.launcherSha256 === null &&
      value.summaryContentSha256 === null &&
      value.topicMapSha256 === null &&
      value.attestationSetSha256 === null &&
      value.completedTaskCount === 0 &&
      value.topicLabeler === null
    );
  }
  return runtimeProvenanceEqual(
    {
      execution: value.runtimeExecution,
      summaryModel: value.summaryModel,
      physicalModel: value.physicalModel,
      provider: value.provider,
      runtime: value.runtime,
      runtimeVersion: value.runtimeVersion,
      reasoningEffort: value.reasoningEffort,
      launcherSha256: value.launcherSha256,
      summaryContentSha256: value.summaryContentSha256,
      topicMapSha256: value.topicMapSha256,
      attestationSetSha256: value.attestationSetSha256,
      completedTaskCount: value.completedTaskCount,
      topicLabeler: value.topicLabeler,
    },
    provenance,
  );
}

function validRunCapture(
  value: unknown,
  binding: DurableEvidenceBinding,
): boolean {
  return (
    isRecord(value) &&
    typeof value.startedAt === "string" &&
    typeof value.completedAt === "string" &&
    captureExecutionMatches(value.captureExecution, binding.captureExecution)
  );
}

function validLiveProvenance(
  value: unknown,
  expectedPeriod: ProductionDayUtcPeriod,
  binding: DurableEvidenceBinding,
): boolean {
  if (!isRecord(value) || !isRecord(value.sourceEvidence)) {
    return false;
  }
  if (value.mode === "historical-regeneration") {
    return validHistoricalRegenerationProvenance({
      value,
      expectedPeriod,
      evidenceBinding: binding,
    });
  }
  return (
    value.mode === "live-production" &&
    value.nonLive === false &&
    value.sourceReport === null &&
    periodsEqual(value.requestedUtcPeriod, expectedPeriod) &&
    periodsEqual(value.collectionUtcPeriod, expectedPeriod) &&
    durableEvidenceBindingEqual(value.sourceEvidence, binding)
  );
}

function validInputs(
  value: unknown,
  expectedPeriod: ProductionDayUtcPeriod,
): boolean {
  return (
    isRecord(value) &&
    value.periodStartedAt === expectedPeriod.startedAt &&
    value.periodEndedAt === expectedPeriod.endedAt &&
    value.timezone === expectedPeriod.timezone &&
    value.periodKey === expectedPeriod.periodKey &&
    value.evidenceArtifactId ===
      "durable-reader-summary-postgres-evidence-v1" &&
    value.frontendArtifactFormat === "frontend-reader-summary-live-fixture-v1"
  );
}

function validExactSteps(value: unknown): boolean {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    return false;
  }
  return exactProductionDayStepsPassed(
    value as unknown as readonly ProductionDayStepReport[],
  );
}

function allQualityGatesPass(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((gate) => gate === true)
  );
}

function validXAccountAttributionContract(stats: unknown): boolean {
  if (!isRecord(stats) || !isRecord(stats.xAccountAttribution)) {
    return false;
  }
  const attribution = stats.xAccountAttribution;
  const statusValid =
    attribution.status === "known" ||
    attribution.status === "partial" ||
    attribution.status === "unknown";
  const terminalStatusValid =
    attribution.terminalObservationStatus === undefined ||
    attribution.terminalObservationStatus === "unambiguous" ||
    attribution.terminalObservationStatus === "ambiguous";
  const rateLimitStatusValid =
    attribution.rateLimitObservationStatus === undefined ||
    attribution.rateLimitObservationStatus === "unambiguous" ||
    attribution.rateLimitObservationStatus ===
      "ambiguous_legacy_uncorrelated";
  const targetRunCorrelationStatusValid =
    attribution.targetRunEventCorrelationStatus === undefined ||
    attribution.targetRunEventCorrelationStatus === "exact" ||
    attribution.targetRunEventCorrelationStatus === "ambiguous" ||
    attribution.targetRunEventCorrelationStatus === "unknown";
  return (
    statusValid &&
    terminalStatusValid &&
    optionalNonNegativeInteger(attribution.ambiguousPassObservationCount) &&
    targetRunCorrelationStatusValid &&
    optionalNonNegativeInteger(attribution.ambiguousTargetRunEventCount) &&
    optionalNonNegativeInteger(attribution.rateLimitCount) &&
    rateLimitStatusValid &&
    optionalNonNegativeInteger(
      attribution.ambiguousLegacyRateLimitEventCount,
    ) &&
    attribution.policy === "warning_only" &&
    typeof attribution.gateReason === "string" &&
    attribution.gateReason.trim().length > 0 &&
    typeof attribution.warningCount === "number" &&
    Number.isInteger(attribution.warningCount) &&
    attribution.warningCount >= 0 &&
    Array.isArray(attribution.warnings) &&
    attribution.warnings.length === attribution.warningCount
  );
}

function optionalNonNegativeInteger(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isInteger(value) && value >= 0)
  );
}

function requireReportEqual(
  actual: unknown,
  expected: unknown,
  field: string,
  violations: string[],
): void {
  if (actual !== expected) {
    violations.push(`report.${field} must equal ${String(expected)}`);
  }
}
