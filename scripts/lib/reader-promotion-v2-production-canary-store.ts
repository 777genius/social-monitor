import type {
  CanaryArtifact,
  CanaryBinding,
  CanaryOutcome,
  CanaryReceipt,
  CanaryRequestedBinding,
  CanaryState,
} from "./reader-promotion-v2-production-canary-contract";

export type CanarySnapshot = {
  readonly binding: CanaryBinding;
  readonly state: CanaryState;
  readonly outcome: CanaryOutcome | null;
  readonly artifact: CanaryArtifact | null;
  readonly artifactSha256: string | null;
  readonly receipt: CanaryReceipt | null;
  readonly rejectionCode: string | null;
};

export type CanaryClaim =
  | { readonly action: "OWNER"; readonly snapshot: CanarySnapshot }
  | { readonly action: "IN_PROGRESS"; readonly snapshot: CanarySnapshot }
  | { readonly action: "TERMINAL"; readonly snapshot: CanarySnapshot };
export type CanaryProviderBarrier = {
  readonly action: "ENTER" | "IN_PROGRESS";
  readonly snapshot: CanarySnapshot;
};

export interface ReaderPromotionV2ProductionCanaryStore {
  claim(binding: CanaryRequestedBinding): Promise<CanaryClaim>;
  markModelRunning(binding: CanaryBinding): Promise<CanaryProviderBarrier>;
  completeModel(params: {
    readonly binding: CanaryBinding;
    readonly outcome: CanaryOutcome;
    readonly artifact: CanaryArtifact | null;
    readonly artifactSha256: string | null;
  }): Promise<CanarySnapshot>;
  rejectUncertain(binding: CanaryBinding): Promise<CanarySnapshot>;
  finalize(params: {
    readonly binding: CanaryBinding;
    readonly receipt: CanaryReceipt;
    readonly receiptSha256: string;
  }): Promise<CanarySnapshot>;
  read(): Promise<CanarySnapshot | null>;
}

export class CanaryOwnershipError extends Error {}
export class CanaryTransitionError extends Error {}
