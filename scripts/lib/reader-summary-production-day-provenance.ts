import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import {
  isProductionSubscriptionRuntimeProvenance,
  runtimeProvenanceEqual,
  runtimeProvenanceFromExecutorAttestations,
  validateFrontendRuntimeConsistency,
  type ProductionDayRuntimeProvenance,
} from "./reader-summary-production-day-attestation";

export { isProductionSubscriptionRuntimeProvenance, runtimeProvenanceEqual };
export type { ProductionDayRuntimeProvenance };

export const productionDayReportArtifactFormat =
  "reader-summary-production-day-run-v1";
export const productionDayReportGeneratedBy =
  "npm run run:reader-summary-production-day";
export const durableReaderSummaryEvidenceArtifactId =
  "durable-reader-summary-postgres-evidence-v1";
export const frontendReaderSummaryArtifactFormat =
  "frontend-reader-summary-live-fixture-v1";

export type ProductionDayUtcPeriod = {
  readonly cadence: "daily";
  readonly startedAt: string;
  readonly endedAt: string;
  readonly timezone: "UTC";
  readonly periodKey: string;
};

export type ProductionDayCaptureExecution = {
  readonly executionId: string;
  readonly startedAt: string;
  readonly completedAt: string;
};

export type ProductionDayRuntimeHealth = {
  readonly status: string;
  readonly runtimeEngine: string;
  readonly runtimeVersion: string;
  readonly launcherSha256: string;
  readonly checkedAt: string;
};

export type CaptureArtifactBinding = ProductionDayCaptureExecution & {
  readonly evidenceGeneratedAt: string;
  readonly frontendGeneratedAt: string;
  readonly frontendArtifactFormat: typeof frontendReaderSummaryArtifactFormat;
  readonly frontendArtifactSha256: string;
  readonly frontendArtifactByteLength: number;
  readonly runtimeHealthCheckedAt: string;
  readonly runtimeEngine: string;
  readonly runtimeVersion: string;
  readonly runtimeLauncherSha256: string;
};

export type DurableEvidenceBinding = {
  readonly artifactId: typeof durableReaderSummaryEvidenceArtifactId;
  readonly sha256: string;
  readonly byteLength: number;
  readonly readerSummaryId: string;
  readonly readerSummaryJobId: string;
  readonly requestedUtcPeriod: ProductionDayUtcPeriod;
  readonly captureExecution: CaptureArtifactBinding;
  readonly runtimeProvenance: ProductionDayRuntimeProvenance;
};

export type EvidenceInspection = {
  readonly binding: DurableEvidenceBinding | null;
  readonly violations: readonly string[];
};

export type FreshCaptureCandidates = {
  readonly evidence: unknown;
  readonly evidenceBytes: Uint8Array;
  readonly frontendArtifact: unknown;
  readonly frontendBytes: Uint8Array;
};

export function productionDayUtcPeriod(
  collectionDate: string,
): ProductionDayUtcPeriod {
  assertCollectionDate(collectionDate);
  const startedAt = `${collectionDate}T00:00:00.000Z`;
  const end = new Date(startedAt);
  end.setUTCDate(end.getUTCDate() + 1);
  const endedAt = end.toISOString();
  return {
    cadence: "daily",
    startedAt,
    endedAt,
    timezone: "UTC",
    periodKey: `daily:${startedAt}:${endedAt}:UTC`,
  };
}

export function readRequiredFreshCaptureCandidates(params: {
  readonly evidencePath: string;
  readonly frontendPath: string;
  readonly capture: ProductionDayCaptureExecution;
}): FreshCaptureCandidates {
  if (!existsSync(params.evidencePath) || !existsSync(params.frontendPath)) {
    throw new Error(
      "Successful durable capture must produce both fresh evidence and frontend artifacts",
    );
  }
  requireCandidateMtime(params.evidencePath, params.capture);
  requireCandidateMtime(params.frontendPath, params.capture);
  const evidenceBytes = readFileSync(params.evidencePath);
  const frontendBytes = readFileSync(params.frontendPath);
  return {
    evidence: parseJson(evidenceBytes, "fresh evidence candidate"),
    evidenceBytes,
    frontendArtifact: parseJson(frontendBytes, "fresh frontend candidate"),
    frontendBytes,
  };
}

export function attachCaptureExecutionEvidence(params: {
  readonly evidence: unknown;
  readonly frontendArtifact: unknown;
  readonly frontendBytes: Uint8Array;
  readonly capture: ProductionDayCaptureExecution;
  readonly runtimeHealth: ProductionDayRuntimeHealth;
}): unknown {
  if (!isRecord(params.evidence)) {
    throw new Error("Fresh evidence candidate must be an object");
  }
  if (!isRecord(params.frontendArtifact)) {
    throw new Error("Fresh frontend candidate must be an object");
  }
  const content = params.frontendArtifact.readerSummaryArtifact;
  const readerSummaryArtifact = isRecord(content) ? content : null;
  const summaryContent = readerSummaryArtifact?.content;
  const topicMap = isRecord(summaryContent) ? summaryContent.topicMap : null;
  if (!isRecord(summaryContent) || !isRecord(topicMap)) {
    throw new Error(
      "Fresh frontend candidate has no persisted summary content",
    );
  }
  const expectedReadback = {
    summaryContentSha256: canonicalJsonSha256(summaryContent),
    topicMapSha256: canonicalJsonSha256(topicMap),
    executionAttestationSetSha256: canonicalJsonSha256(
      params.evidence.executionAttestations,
    ),
  };
  if (
    params.evidence.durableReadback !== undefined &&
    canonicalJsonSha256(params.evidence.durableReadback) !==
      canonicalJsonSha256(expectedReadback)
  ) {
    throw new Error(
      "Fresh durable readback hashes do not match persisted bytes",
    );
  }
  const evidenceWithReadback = {
    ...params.evidence,
    durableReadback: expectedReadback,
  };
  const violations: string[] = [];
  const runtimeProvenance = runtimeProvenanceFromExecutorAttestations(
    evidenceWithReadback,
    violations,
  );
  if (runtimeProvenance !== null && isRecord(params.frontendArtifact)) {
    validateFrontendRuntimeConsistency(
      params.frontendArtifact,
      runtimeProvenance,
      violations,
    );
  }
  if (runtimeProvenance === null || violations.length > 0) {
    throw new Error(
      `Fresh capture runtime provenance is invalid: ${violations.join("; ")}`,
    );
  }
  const frontend = params.frontendArtifact;
  return {
    ...evidenceWithReadback,
    captureExecution: {
      schemaVersion: 1,
      ...params.capture,
      runtimeHealth: params.runtimeHealth,
      frontendArtifact: {
        format: frontend.format,
        sha256: sha256Hex(params.frontendBytes),
        byteLength: params.frontendBytes.byteLength,
        generatedAt: frontend.generatedAt,
      },
      runtimeResult: runtimeProvenance,
    },
  };
}

export function inspectDurableEvidenceArtifact(params: {
  readonly evidence: unknown;
  readonly evidenceBytes: Uint8Array;
  readonly frontendArtifact: unknown;
  readonly frontendBytes: Uint8Array;
  readonly expectedDate: string;
  readonly expectedCapture?: ProductionDayCaptureExecution;
}): EvidenceInspection {
  const violations: string[] = [];
  const expectedPeriod = productionDayUtcPeriod(params.expectedDate);
  const evidence = recordOrViolation(
    params.evidence,
    "evidence artifact",
    violations,
  );
  const frontend = recordOrViolation(
    params.frontendArtifact,
    "frontend artifact",
    violations,
  );
  if (evidence === null || frontend === null) {
    return { binding: null, violations };
  }

  requireEqual(evidence.schemaVersion, 1, "evidence.schemaVersion", violations);
  requireEqual(
    evidence.artifactId,
    durableReaderSummaryEvidenceArtifactId,
    "evidence.artifactId",
    violations,
  );
  requireEqual(
    evidence.format,
    durableReaderSummaryEvidenceArtifactId,
    "evidence.format",
    violations,
  );
  requireEqual(
    frontend.format,
    frontendReaderSummaryArtifactFormat,
    "frontend.format",
    violations,
  );
  validateEvidenceCaptureProvenance(
    evidence.provenance,
    evidence.inputInventoryTimestampPolicy,
    violations,
  );
  validatePeriod(
    evidence.period,
    expectedPeriod,
    "evidence.period",
    violations,
  );

  const result = recordOrViolation(
    evidence.result,
    "evidence.result",
    violations,
  );
  if (result !== null) {
    requireUuid(
      result.readerSummaryId,
      "evidence.result.readerSummaryId",
      violations,
    );
    requireUuid(
      result.readerSummaryJobId,
      "evidence.result.readerSummaryJobId",
      violations,
    );
    if (result.status !== "completed" && result.status !== "no_signal") {
      violations.push("evidence.result.status must be completed or no_signal");
    }
  }

  const capture = validateCaptureExecution({
    value: evidence.captureExecution,
    evidenceGeneratedAt: evidence.generatedAt,
    frontendGeneratedAt: frontend.generatedAt,
    frontendBytes: params.frontendBytes,
    expectedCapture: params.expectedCapture,
    violations,
  });
  const runtimeProvenance =
    capture === null
      ? null
      : runtimeProvenanceFromExecutorAttestations(evidence, violations);
  if (
    capture !== null &&
    runtimeProvenance !== null &&
    !runtimeProvenanceEqual(capture.runtimeResult, runtimeProvenance)
  ) {
    violations.push(
      "evidence.captureExecution.runtimeResult must match actual captured artifacts",
    );
  }
  if (
    capture !== null &&
    runtimeProvenance?.execution === "attested" &&
    (capture.runtimeHealth.runtimeEngine !== runtimeProvenance.runtime ||
      capture.runtimeHealth.runtimeVersion !==
        runtimeProvenance.runtimeVersion ||
      capture.runtimeHealth.launcherSha256 !== runtimeProvenance.launcherSha256)
  ) {
    violations.push(
      "live runtime identity must match the executor attestation identity",
    );
  }
  if (runtimeProvenance !== null) {
    validateFrontendRuntimeConsistency(frontend, runtimeProvenance, violations);
  }
  if (
    runtimeProvenance !== null &&
    !isProductionSubscriptionRuntimeProvenance(runtimeProvenance)
  ) {
    violations.push(
      "captured runtime result must use the production subscription runtime",
    );
  }
  validateFrontendIdentity(frontend, result, expectedPeriod, violations);

  if (
    violations.length > 0 ||
    result === null ||
    capture === null ||
    runtimeProvenance === null
  ) {
    return { binding: null, violations };
  }

  return {
    binding: {
      artifactId: durableReaderSummaryEvidenceArtifactId,
      sha256: sha256Hex(params.evidenceBytes),
      byteLength: params.evidenceBytes.byteLength,
      readerSummaryId: result.readerSummaryId as string,
      readerSummaryJobId: result.readerSummaryJobId as string,
      requestedUtcPeriod: expectedPeriod,
      captureExecution: {
        executionId: capture.execution.executionId,
        startedAt: capture.execution.startedAt,
        completedAt: capture.execution.completedAt,
        evidenceGeneratedAt: evidence.generatedAt as string,
        frontendGeneratedAt: frontend.generatedAt as string,
        frontendArtifactFormat: frontendReaderSummaryArtifactFormat,
        frontendArtifactSha256: sha256Hex(params.frontendBytes),
        frontendArtifactByteLength: params.frontendBytes.byteLength,
        runtimeHealthCheckedAt: capture.runtimeHealth.checkedAt,
        runtimeEngine: capture.runtimeHealth.runtimeEngine,
        runtimeVersion: capture.runtimeHealth.runtimeVersion,
        runtimeLauncherSha256: capture.runtimeHealth.launcherSha256,
      },
      runtimeProvenance,
    },
    violations,
  };
}

export function summaryBindingMatches(params: {
  readonly summary: unknown;
  readonly binding: DurableEvidenceBinding;
}): boolean {
  if (!isRecord(params.summary)) {
    return false;
  }
  return (
    params.summary.readerSummaryId === params.binding.readerSummaryId &&
    params.summary.readerSummaryJobId === params.binding.readerSummaryJobId &&
    params.summary.evidenceArtifactId === params.binding.artifactId &&
    params.summary.evidenceArtifactSha256 === params.binding.sha256 &&
    params.summary.evidenceArtifactByteLength === params.binding.byteLength &&
    periodsEqual(
      params.summary.requestedUtcPeriod,
      params.binding.requestedUtcPeriod,
    ) &&
    captureBindingEqual(
      params.summary.captureExecution,
      params.binding.captureExecution,
    ) &&
    runtimeProvenanceEqual(
      params.summary.runtimeProvenance,
      params.binding.runtimeProvenance,
    )
  );
}

export function durableEvidenceBindingEqual(
  value: unknown,
  expected: DurableEvidenceBinding,
): boolean {
  return (
    isRecord(value) &&
    value.artifactId === expected.artifactId &&
    value.sha256 === expected.sha256 &&
    value.byteLength === expected.byteLength &&
    value.readerSummaryId === expected.readerSummaryId &&
    value.readerSummaryJobId === expected.readerSummaryJobId &&
    periodsEqual(value.requestedUtcPeriod, expected.requestedUtcPeriod) &&
    captureBindingEqual(value.captureExecution, expected.captureExecution) &&
    runtimeProvenanceEqual(value.runtimeProvenance, expected.runtimeProvenance)
  );
}

export function productionDayReportIdentity(params: {
  readonly collectionDate: string;
  readonly binding: DurableEvidenceBinding;
}) {
  const expectedPeriod = productionDayUtcPeriod(params.collectionDate);
  if (!periodsEqual(params.binding.requestedUtcPeriod, expectedPeriod)) {
    throw new Error(
      "Evidence binding period does not match the requested UTC day",
    );
  }
  return {
    artifactId: [
      productionDayReportArtifactFormat,
      params.collectionDate,
      params.binding.readerSummaryId,
      params.binding.readerSummaryJobId,
      params.binding.artifactId,
      params.binding.sha256,
      params.binding.captureExecution.frontendArtifactSha256,
      params.binding.captureExecution.executionId,
    ].join("/"),
    requestedDate: params.collectionDate,
    readerSummaryId: params.binding.readerSummaryId,
    readerSummaryJobId: params.binding.readerSummaryJobId,
    evidenceArtifactId: params.binding.artifactId,
    evidenceArtifactSha256: params.binding.sha256,
    frontendArtifactSha256:
      params.binding.captureExecution.frontendArtifactSha256,
    captureExecutionId: params.binding.captureExecution.executionId,
    requestedUtcPeriod: expectedPeriod,
  };
}

export function reportIdentityMatches(params: {
  readonly reportIdentity: unknown;
  readonly collectionDate: string;
  readonly binding: DurableEvidenceBinding;
}): boolean {
  if (!isRecord(params.reportIdentity)) {
    return false;
  }
  const expected = productionDayReportIdentity(params);
  return (
    params.reportIdentity.artifactId === expected.artifactId &&
    params.reportIdentity.requestedDate === expected.requestedDate &&
    params.reportIdentity.readerSummaryId === expected.readerSummaryId &&
    params.reportIdentity.readerSummaryJobId === expected.readerSummaryJobId &&
    params.reportIdentity.evidenceArtifactId === expected.evidenceArtifactId &&
    params.reportIdentity.evidenceArtifactSha256 ===
      expected.evidenceArtifactSha256 &&
    params.reportIdentity.frontendArtifactSha256 ===
      expected.frontendArtifactSha256 &&
    params.reportIdentity.captureExecutionId === expected.captureExecutionId &&
    periodsEqual(
      params.reportIdentity.requestedUtcPeriod,
      expected.requestedUtcPeriod,
    )
  );
}

export function captureExecutionMatches(
  value: unknown,
  expected: ProductionDayCaptureExecution,
): boolean {
  return (
    isRecord(value) &&
    value.executionId === expected.executionId &&
    value.startedAt === expected.startedAt &&
    value.completedAt === expected.completedAt
  );
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

export function periodsEqual(
  value: unknown,
  expected: ProductionDayUtcPeriod,
): boolean {
  return (
    isRecord(value) &&
    value.cadence === expected.cadence &&
    value.startedAt === expected.startedAt &&
    value.endedAt === expected.endedAt &&
    value.timezone === expected.timezone &&
    value.periodKey === expected.periodKey
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateCaptureExecution(params: {
  readonly value: unknown;
  readonly evidenceGeneratedAt: unknown;
  readonly frontendGeneratedAt: unknown;
  readonly frontendBytes: Uint8Array;
  readonly expectedCapture?: ProductionDayCaptureExecution;
  readonly violations: string[];
}): {
  readonly execution: ProductionDayCaptureExecution;
  readonly runtimeHealth: ProductionDayRuntimeHealth;
  readonly runtimeResult: unknown;
} | null {
  const capture = recordOrViolation(
    params.value,
    "evidence.captureExecution",
    params.violations,
  );
  if (capture === null) {
    return null;
  }
  requireEqual(
    capture.schemaVersion,
    1,
    "evidence.captureExecution.schemaVersion",
    params.violations,
  );
  requireUuid(
    capture.executionId,
    "evidence.captureExecution.executionId",
    params.violations,
  );
  requireIsoTimestamp(
    capture.startedAt,
    "evidence.captureExecution.startedAt",
    params.violations,
  );
  requireIsoTimestamp(
    capture.completedAt,
    "evidence.captureExecution.completedAt",
    params.violations,
  );
  const execution = {
    executionId: capture.executionId as string,
    startedAt: capture.startedAt as string,
    completedAt: capture.completedAt as string,
  };
  if (
    params.expectedCapture !== undefined &&
    !captureExecutionMatches(execution, params.expectedCapture)
  ) {
    params.violations.push(
      "evidence.captureExecution must match the current runner execution",
    );
  }
  validateTimestampWithin(
    params.evidenceGeneratedAt,
    execution,
    "evidence.generatedAt",
    params.violations,
  );
  validateTimestampWithin(
    params.frontendGeneratedAt,
    execution,
    "frontend.generatedAt",
    params.violations,
  );

  const runtimeHealth = recordOrViolation(
    capture.runtimeHealth,
    "evidence.captureExecution.runtimeHealth",
    params.violations,
  );
  const frontendArtifact = recordOrViolation(
    capture.frontendArtifact,
    "evidence.captureExecution.frontendArtifact",
    params.violations,
  );
  if (runtimeHealth === null || frontendArtifact === null) {
    return null;
  }
  requireEqual(
    runtimeHealth.status,
    "serving",
    "evidence.captureExecution.runtimeHealth.status",
    params.violations,
  );
  requireNonEmptyString(
    runtimeHealth.runtimeEngine,
    "evidence.captureExecution.runtimeHealth.runtimeEngine",
    params.violations,
  );
  requireNonEmptyString(
    runtimeHealth.runtimeVersion,
    "evidence.captureExecution.runtimeHealth.runtimeVersion",
    params.violations,
  );
  if (!/^[0-9a-f]{64}$/u.test(String(runtimeHealth.launcherSha256))) {
    params.violations.push(
      "evidence.captureExecution.runtimeHealth.launcherSha256 must be SHA-256",
    );
  }
  validateTimestampWithin(
    runtimeHealth.checkedAt,
    execution,
    "evidence.captureExecution.runtimeHealth.checkedAt",
    params.violations,
  );
  requireEqual(
    frontendArtifact.format,
    frontendReaderSummaryArtifactFormat,
    "evidence.captureExecution.frontendArtifact.format",
    params.violations,
  );
  requireEqual(
    frontendArtifact.sha256,
    sha256Hex(params.frontendBytes),
    "evidence.captureExecution.frontendArtifact.sha256",
    params.violations,
  );
  requireEqual(
    frontendArtifact.byteLength,
    params.frontendBytes.byteLength,
    "evidence.captureExecution.frontendArtifact.byteLength",
    params.violations,
  );
  requireEqual(
    frontendArtifact.generatedAt,
    params.frontendGeneratedAt,
    "evidence.captureExecution.frontendArtifact.generatedAt",
    params.violations,
  );
  return {
    execution,
    runtimeHealth: {
      status: runtimeHealth.status as string,
      runtimeEngine: runtimeHealth.runtimeEngine as string,
      runtimeVersion: runtimeHealth.runtimeVersion as string,
      launcherSha256: runtimeHealth.launcherSha256 as string,
      checkedAt: runtimeHealth.checkedAt as string,
    },
    runtimeResult: capture.runtimeResult,
  };
}

function validateFrontendIdentity(
  frontend: Record<string, unknown>,
  evidenceResult: Record<string, unknown> | null,
  expectedPeriod: ProductionDayUtcPeriod,
  violations: string[],
): void {
  const readerArtifact = recordOrViolation(
    frontend.readerSummaryArtifact,
    "frontend.readerSummaryArtifact",
    violations,
  );
  const frontendEvidence = recordOrViolation(
    frontend.evidence,
    "frontend.evidence",
    violations,
  );
  if (
    readerArtifact === null ||
    frontendEvidence === null ||
    evidenceResult === null
  ) {
    return;
  }
  requireEqual(
    readerArtifact.readerSummaryId,
    evidenceResult.readerSummaryId,
    "frontend.readerSummaryArtifact.readerSummaryId",
    violations,
  );
  requireEqual(
    frontendEvidence.readerSummaryId,
    evidenceResult.readerSummaryId,
    "frontend.evidence.readerSummaryId",
    violations,
  );
  requireEqual(
    frontendEvidence.readerSummaryJobId,
    evidenceResult.readerSummaryJobId,
    "frontend.evidence.readerSummaryJobId",
    violations,
  );
  validatePeriod(
    readerArtifact.period,
    expectedPeriod,
    "frontend.readerSummaryArtifact.period",
    violations,
  );
}

function validateEvidenceCaptureProvenance(
  value: unknown,
  inputInventoryTimestampPolicy: unknown,
  violations: string[],
): void {
  const provenance = recordOrViolation(
    value,
    "evidence.provenance",
    violations,
  );
  if (provenance === null) {
    return;
  }
  requireEqual(
    provenance.runner,
    "scripts/capture-durable-reader-summary-from-postgres.ts",
    "evidence.provenance.runner",
    violations,
  );
  requireEqual(
    provenance.fixtureOnly,
    false,
    "evidence.provenance.fixtureOnly",
    violations,
  );
  requireEqual(
    provenance.database,
    "postgres",
    "evidence.provenance.database",
    violations,
  );
  requireEqual(
    provenance.modelMode,
    "agent-runtime",
    "evidence.provenance.modelMode",
    violations,
  );
  if (provenance.datasetManifest !== undefined) {
    validateDatasetManifestGuardEvidence(
      provenance.datasetManifest,
      violations,
    );
    if (
      !isRecord(provenance.datasetManifest) ||
      inputInventoryTimestampPolicy !==
        provenance.datasetManifest.timestampPolicy
    ) {
      violations.push(
        "evidence input inventory timestamp policy must match the immutable dataset guard",
      );
    }
  } else if (
    inputInventoryTimestampPolicy !== undefined &&
    inputInventoryTimestampPolicy !== "published_at"
  ) {
    violations.push(
      "unguarded evidence input inventory timestamp policy must be published_at",
    );
  }
}

function validateDatasetManifestGuardEvidence(
  value: unknown,
  violations: string[],
): void {
  const guard = recordOrViolation(
    value,
    "evidence.provenance.datasetManifest",
    violations,
  );
  if (guard === null) {
    return;
  }
  const hashesValid = [guard.manifestFileSha256, guard.datasetSha256].every(
    (hash) => typeof hash === "string" && /^[0-9a-f]{64}$/u.test(hash),
  );
  const expectedPhases = [
    "before_evidence_selection",
    "after_evidence_selection",
    "before_publication",
  ];
  if (
    guard.manifestFormat !== "reader-summary-day-dataset-manifest-v1" ||
    typeof guard.manifestGeneratedAt !== "string" ||
    !hashesValid ||
    typeof guard.feedRowCount !== "number" ||
    typeof guard.githubEligibilityRowCount !== "number" ||
    (guard.timestampPolicy !== "published_at" &&
      guard.timestampPolicy !== "observed_at") ||
    !isRecord(guard.providerCounts) ||
    JSON.stringify(guard.completedPhases) !== JSON.stringify(expectedPhases)
  ) {
    violations.push(
      "evidence.provenance.datasetManifest must contain a complete immutable dataset guard",
    );
  }
}

function captureBindingEqual(
  value: unknown,
  expected: CaptureArtifactBinding,
): boolean {
  return (
    isRecord(value) &&
    value.executionId === expected.executionId &&
    value.startedAt === expected.startedAt &&
    value.completedAt === expected.completedAt &&
    value.evidenceGeneratedAt === expected.evidenceGeneratedAt &&
    value.frontendGeneratedAt === expected.frontendGeneratedAt &&
    value.frontendArtifactFormat === expected.frontendArtifactFormat &&
    value.frontendArtifactSha256 === expected.frontendArtifactSha256 &&
    value.frontendArtifactByteLength === expected.frontendArtifactByteLength &&
    value.runtimeHealthCheckedAt === expected.runtimeHealthCheckedAt &&
    value.runtimeEngine === expected.runtimeEngine &&
    value.runtimeVersion === expected.runtimeVersion &&
    value.runtimeLauncherSha256 === expected.runtimeLauncherSha256
  );
}

function validatePeriod(
  value: unknown,
  expected: ProductionDayUtcPeriod,
  label: string,
  violations: string[],
): void {
  if (!periodsEqual(value, expected)) {
    violations.push(`${label} must exactly match the requested UTC period`);
  }
}

function validateTimestampWithin(
  value: unknown,
  execution: ProductionDayCaptureExecution,
  label: string,
  violations: string[],
): void {
  requireIsoTimestamp(value, label, violations);
  if (
    typeof value !== "string" ||
    !isIsoTimestamp(execution.startedAt) ||
    !isIsoTimestamp(execution.completedAt) ||
    Date.parse(execution.startedAt) > Date.parse(execution.completedAt) ||
    Date.parse(value) < Date.parse(execution.startedAt) ||
    Date.parse(value) > Date.parse(execution.completedAt)
  ) {
    violations.push(`${label} must be within the current capture execution`);
  }
}

function requireCandidateMtime(
  path: string,
  capture: ProductionDayCaptureExecution,
): void {
  const modifiedAt = statSync(path).mtimeMs;
  const startedAt = Date.parse(capture.startedAt);
  const completedAt = Date.parse(capture.completedAt);
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(completedAt) ||
    modifiedAt < startedAt - 1_000 ||
    modifiedAt > completedAt + 1_000
  ) {
    throw new Error(`Capture candidate is not fresh for execution: ${path}`);
  }
}

function recordOrViolation(
  value: unknown,
  label: string,
  violations: string[],
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    violations.push(`${label} must be an object`);
    return null;
  }
  return value;
}

function requireUuid(
  value: unknown,
  label: string,
  violations: string[],
): void {
  if (!isUuid(value)) {
    violations.push(`${label} must be a UUID`);
  }
}

function requireNonEmptyString(
  value: unknown,
  label: string,
  violations: string[],
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    violations.push(`${label} must be a non-empty string`);
  }
}

function requireIsoTimestamp(
  value: unknown,
  label: string,
  violations: string[],
): void {
  if (!isIsoTimestamp(value)) {
    violations.push(`${label} must be an exact ISO timestamp`);
  }
}

function requireEqual(
  actual: unknown,
  expected: unknown,
  label: string,
  violations: string[],
): void {
  if (actual !== expected) {
    violations.push(`${label} must equal ${String(expected)}`);
  }
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function assertCollectionDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`Collection date must use YYYY-MM-DD format: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Collection date is invalid: ${value}`);
  }
}
