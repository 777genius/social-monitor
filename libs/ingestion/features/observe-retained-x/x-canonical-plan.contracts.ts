import type { CanonicalInvocation, CanonicalLane, PlanDigest, PlanRecord, PlanningResult,
  ProposedBounds, ResolvedCanonicalPolicyV1, RetainedDescriptor } from "../../domain/x-observation/x-canonical-graph-policy";

export type CanonicalPlanDayInput = Readonly<{
  day: string; cellId: string; clockAt: string; windowStart: string; windowEnd: string; targetItems: 100;
  scanJobId: string; predecessorHash: string;
}>;
export type CanonicalPlanInput = Readonly<{
  base: "429e0f229c50f596d708216708775456b788251b";
  evidenceMode: "SYNTHETIC" | "DEPLOYMENT";
  inputEvidence: readonly Readonly<{ kind: string; provenance: "CURRENT" | "FROZEN" | "SYNTHETIC"; sha256: string; observedAt: string }>[];
  sourcePins: Readonly<Record<string, string>>;
  scope: Readonly<{ tenantId: string; workspaceId: string; sourceBindingId: string; interestId: string;
    scanPolicyId: string; correlationId: string }>;
  entrypoint: "binding-scan" | "recorded-command";
  bindingConfig: PlanRecord;
  command: Readonly<{ mode: "search"; query: string; parameters: PlanRecord }>;
  configReader: PlanRecord;
  planner: Readonly<{ branch: "disabled" | "absent" | "degraded" | "compiled";
    injected: boolean; plan: PlanRecord | null; compilation: PlanRecord | null }>;
  scanPlan: Readonly<{ query: Readonly<{ mode: "search"; query: string; parameters: PlanRecord }>;
    maxItems: number; cursorPresence: "ABSENT" | "PRESENT"; cursorHash: string | null }>;
  effectiveConfig: PlanRecord;
  maxSearchQueries: number; amendmentId: string;
  days: readonly CanonicalPlanDayInput[];
  sdkProfile: PlanRecord;
  sdkExpansionHash: string;
  retained: readonly RetainedDescriptor[];
  acceptedSiblingHashes: readonly string[];
}>;
export type CanonicalSdkExpansion = Readonly<{ invocations: readonly CanonicalInvocation[]; profileHash: string }>;
export type ProposedCanonicalPlan = Readonly<{
  kind: "x-canonical-graph-plan"; planningVersion: 1; releaseState: "PROPOSED";
  evidenceMode: "SYNTHETIC" | "DEPLOYMENT"; productionGraphFrozen: false;
  unresolvedReleaseDependencies: readonly ["E3_CAPTURE", "E4_ADMISSION", "NATIVE_MODEL_PARITY", "SEND_AMENDMENT"];
  inputHash: string; inputSnapshot: CanonicalPlanInput; compilerManifestHash: string; lanes: readonly CanonicalLane[];
  invocations: readonly CanonicalInvocation[]; retained: readonly RetainedDescriptor[];
  resolvedSettings: PlanRecord; policy: ResolvedCanonicalPolicyV1; bounds: ProposedBounds; graphHash: string;
}>;
export interface CanonicalPlanCompiler {
  compile(input: unknown, sdkExpansion: unknown): PlanningResult<ProposedCanonicalPlan>;
}
// Supplied by the outer offline caller; no filesystem, process, or SDK types enter this contract.
export type CanonicalCompilerCapabilities = Readonly<{
  digest: PlanDigest; utf8Digest: (value: string) => string;
  verifiedSourcePins: Readonly<Record<string, string>>;
  // Hashes of outputs actually prepared by the pinned offline SDK seam, not caller-supplied input hashes.
  verifiedSdkExpansionHashes: readonly string[];
}>;
