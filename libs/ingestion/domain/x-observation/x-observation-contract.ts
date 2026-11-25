import type { XAcquisitionPayload, XSupplementary, XPredecessorEvidence } from "./x-observation-acquisition-contract";

// OWNER STATUS: dormant historical-recovery experiment, not an approved runtime path.
// Prefer a simpler bounded and auditable recovery for any concrete missed-post incident.
// Do not compose, activate, or extend this design without fresh explicit owner agreement
// and evidence that the simpler recovery path cannot safely meet the requirement.
// Incident-only values. Generated transport types never enter the authority model.
export const xOperationId = "seven-day-6101-6102/x-observation-v1";
export const xTenantId = "00000000-0000-7000-8000-000000006101";
export const xWorkspaceId = "00000000-0000-7000-8000-000000006102";
export const xDays = ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"] as const;
export const xBounds = Object.freeze({ sends: 350, items: 5600, elapsedMs: 4_200_000,
  daySends: 50, dayItems: 800, dayElapsedMs: 600_000, queries: 8, pages: 5,
  bootstrapSends: 6, redirects: 2, requestMs: 10_000, count: 20, targets: 1000, fanout: 1000 });
export type XStage = "HOME" | "MIGRATION_GET" | "MIGRATION_POST" | "JS" | "BOOTSTRAP_REDIRECT" | "SEARCH";
export type XFailureCode = "INVALID_GRANT" | "SCOPE_MISMATCH" | "DEPENDENCY_MISMATCH" | "PROTOCOL_ERROR" |
  "FENCE_BUSY" | "JOURNAL_FAILURE" | "BUDGET_EXHAUSTED" | "DEADLINE_EXCEEDED" | "CANCELLED" |
  "DESTINATION_REJECTED" | "REDIRECT_REJECTED" | "BODY_LIMIT" | "HEADER_LIMIT" | "DECODE_FAILED" |
  "SCHEMA_INVALID" | "BOOTSTRAP_FAILED" | "TRANSACTION_FAILED" | "AUTH_FAILED" | "RATE_LIMITED" |
  "PROVIDER_FAILED" | "TRANSPORT_UNVERIFIED" | "EFFECTS_UNKNOWN" | "AUTHORITY_CHANGED" | "PROJECTION_UNCERTAIN";
export type XFailure = Readonly<{ code: XFailureCode; stage: XStage; sequence?: number;
  effects: "NONE" | "POSSIBLE" | "OBSERVED"; receiptHash?: string; retryable: false }>;
export const xFailure = (code: XFailureCode, stage: XStage = "HOME", sequence?: number,
  effects: XFailure["effects"] = "NONE"): XFailure => ({ code, stage, ...(sequence === undefined ? {} : { sequence }), effects, retryable: false });
export type XByteDigest = Readonly<{ sha256(bytes: Uint8Array): string }>;
export type XDigest = (value: unknown) => string;
export type XTarget = Readonly<{
  targetKey: string; tenantId: string; workspaceId: string; sourceItemId: string; sourceBindingId: string;
  // v2 projection keeps this persisted key; externalId remains the provider decimal ID.
  storageKey?: string;
  externalId: string; canonicalUrl: string; publishedAt: string; contentHash: string; configHash: string;
  authorityHash: string; queryHash: string; fanoutHash: string; feedIds: readonly string[];
  latestObservedAt: string | null; latestMetricsHash: string | null;
  // Absent only on legacy journals; never sufficient authority for a new projection.
  sourceObservedAt?: string | null;
  requiredMetrics: readonly XMetricName[];
}>;
export type XStoredTarget = XTarget & Readonly<{ storageKey: `x-twitter:${string}` }>;
export type XMetricName = "likes" | "reposts" | "replies" | "quotes" | "views";
export type XMetric = Readonly<{ state: "OBSERVED"; valueDecimal: string } |
  { state: "MISSING" | "MALFORMED" | "CONFLICT" }>;
export type XQuery = Readonly<{ queryId: string; query: string; product: "TOP" | "LATEST";
  targetKeys: readonly string[] }>;
export type XDayPlan = Readonly<{ day: string; epoch: number; queries: readonly XQuery[] }>;
export type XAcceptedReceipt = Readonly<{ receiptId: string; day: string; providerKey: string;
  sourceBindingId: string; bytesHash: string }>;
export type XRelease = Readonly<{
  dependencyHash: string; manifestHash: string; profileHash: string; implementationHash: string;
  accountRef: string; accountIdentityHash: string; transportAttestationHash: string;
  laneBGatesHash: string; readOnlyEvidenceViewHash: string; serviceIdentityHash: string;
  accountExclusionHash: string; childContainmentHash: string;
}>;
export type XGrant = Readonly<{
  operationId: typeof xOperationId; tenantId: typeof xTenantId; workspaceId: typeof xWorkspaceId;
  release: XRelease; days: readonly XDayPlan[]; targets: readonly XTarget[];
  acceptedReceipts: readonly XAcceptedReceipt[]; inventoryHash: string; queryPlanHash: string;
  acceptedReceiptsHash: string; releaseHash: string;
}> & (Readonly<{ schemaVersion: 1 }> | Readonly<{ schemaVersion: 2; supplementary: XSupplementary }>);
export type XAdmission = Readonly<{ grant: XGrant; grantHash: string; admittedAt: string; deadlineAt: string }>;
export type XCurrentEvidence = Readonly<{ targets: readonly XTarget[]; acceptedReceipts: readonly XAcceptedReceipt[];
  release: XRelease; byteDigest?: XByteDigest; operationState?: "UNADMITTED"; predecessors?: readonly XPredecessorEvidence[]; ingestionPolicy?: unknown }>;
export type XSendOffer = Readonly<{ operationId: string; batchId: string; epoch: number; sequence: number;
  stage: XStage; requestDigest: string; destinationRuleId: string; accountRef: string; queryId?: string;
  pageIndex?: number; cursorHash?: string; parentSequence?: number; timeoutMs: number }>;
export type XPermit = Readonly<{ operationId: string; batchId: string; sequence: number; requestDigest: string;
  reservationHash: string; fenceGeneration: number; expiresAt: string }>;
export type XObservation = Readonly<{ targetKey: string; sourceItemId: string; sourceBindingId: string;
  externalId: string; canonicalUrl: string; publishedAt: string; responseObservedAt: string;
  requestSequence: number; queryId: string; metrics: Readonly<Record<XMetricName, XMetric>>; identityState: "VALID" }>;
export type XTargetState = "OBSERVED" | "OMITTED_UNKNOWN" | "INVALID" | "UNATTEMPTED" |
  "BUDGET_EXHAUSTED" | "TRANSPORT_FAILED" | "UNCERTAIN";
export type XTargetOutcome = Readonly<{ targetKey: string; state: XTargetState; reasonCode: string;
  observationRefs: readonly string[] }>;
export type XSendOutcome = Readonly<{ operationId: string; batchId: string; sequence: number;
  reservationHash: string; requestDigest: string; stage: XStage; startedAt: string; endedAt: string;
  responseObservedAt?: string; outcome: "SUCCESS" | "REDIRECT" | "FAILED" | "UNCERTAIN"; statusCode?: number;
  encodedBytes: number; decodedBytes: number; headerBytes: number; candidateCount?: number;
  candidateCountLowerBound?: number; cursorState: "NONE" | "BOTTOM" | "REPEATED" | "INVALID";
  reducedObservations: readonly XObservation[]; targetOutcomes: readonly XTargetOutcome[];
  chunkIndex: number; finalChunk: boolean; resultHash: string; acquisition?: XAcquisitionPayload }>;

// Next composition owner replaces its v1-only XStart with an explicit version union.
// No existing client/use case constructs this message in this source checkpoint.
export type XPrivateStartV2 = Readonly<{ schemaVersion: 2; operationId: string; grantHash: string;
  inventoryHash: string; tenantId: string; workspaceId: string; batchId: string; day: string;
  queryPlanHash: string; accountRef: string; dependencyHash: string; manifestHash: string;
  deadlineAt: string; mode: "EXECUTE" | "REPLAY_ONLY" }>;
