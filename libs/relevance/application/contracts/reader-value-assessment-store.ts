import type { ReaderValueAnswers } from '../../domain/reader-value/reader-value-assessment';
import type { ReaderValueFailure } from '../../domain/reader-value/reader-value-failure';
import type { ReaderValueSourceSnapshot } from '../../domain/reader-value/reader-value-source';

export type ReaderValueScope = {
  readonly tenantId: string;
  readonly workspaceId: string;
  /** Present whenever paid discovery/dispatch is authorized for one interest. */
  readonly interestId?: string;
};
export type ReaderValueDiscoveryScope = ReaderValueScope & {
  readonly interestId: string;
};
export type ReaderValuePreparedInput = ReaderValueScope & {
  readonly interestId: string;
  readonly sourceItemId: string;
  readonly sourceRevisionKey: string;
  readonly sourceSnapshotSha256: string;
  readonly interestSha256: string;
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  readonly inputBuilderVersion: string;
  readonly modelConfigVersion: string;
  /** Versioned identity includes exact raw interest and request/diagnostic envelope digests. */
  readonly inputSha256: string;
  /** Hash of requestBody: wire bytes for runnable inputs, diagnostic envelope for terminal inputs. */
  readonly requestSha256: string;
  readonly requestedModel: string;
  readonly requestBody: string;
  /** No wire request exists for these exact inputs; persist terminal with zero attempts. */
  readonly terminalFailure?: 'empty_input' | 'configuration_invalid';
  readonly snapshot: ReaderValueSourceSnapshot;
};
export type ReaderValueAccounting = {
  readonly requestId: string | null;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly costUsd: number | null;
  readonly usageUnknown: boolean;
};
export type ReaderValueExecution = ReaderValueAccounting & {
  readonly resolvedModel: string;
  readonly provider: string;
};
export type ReaderValueScoringOutcome =
  | { readonly ok: true; readonly answers: ReaderValueAnswers; readonly execution: ReaderValueExecution }
  | { readonly ok: false; readonly failure: ReaderValueFailure; readonly execution?: ReaderValueAccounting };

export interface ReaderValueScorer {
  score(input: ReaderValuePreparedInput): Promise<ReaderValueScoringOutcome>;
}

export type ReaderValueAssessmentState = 'pending' | 'running' | 'assessed' | 'retryable_failed' | 'permanent_failed';
export type ReaderValueAssessment = {
  readonly id: string;
  readonly input: ReaderValuePreparedInput;
  readonly state: ReaderValueAssessmentState;
  readonly attempts: number;
  readonly leaseToken: string | null;
  readonly leaseUntil: string | null;
  readonly assessedAt: string | null;
  readonly answers: ReaderValueAnswers | null;
  readonly usageUnknown: boolean;
  readonly costUsd: number | null;
  readonly errorCode: string | null;
};
export type ReaderValueReference = {
  readonly assessmentId: string;
  readonly feedItemId: string;
  readonly sourceSnapshotSha256: string;
  readonly inputSha256: string;
};
export type ReaderValueRead =
  | { readonly status: 'unavailable' | 'stale'; readonly assessmentId: string }
  | { readonly status: 'available'; readonly assessment: ReaderValueAssessment };

export type ReaderValueCleanupPolicy = {
  readonly version: string;
  /** null means unknown policy: fail closed, including scope erasure. */
  readonly retentionHoldWorkspaceIds: readonly string[] | null;
  readonly eraseRevokedScopes: boolean;
};
export type ReaderValueCleanupResult = {
  readonly deleted: number;
  readonly deferredActiveJob: number;
  readonly deferredHold: number;
  readonly deferredUnknownPolicy: number;
};

export interface ReaderValueAssessmentStore {
  backlogAgeMs(scope: ReaderValueScope, configVersion: string, pinnedOnly: boolean): Promise<number>;
  ensure(id: string, input: ReaderValuePreparedInput): Promise<ReaderValueAssessment | null>;
  claim(scope: ReaderValueScope, configVersion: string, leaseToken: string, pinnedOnly: boolean): Promise<ReaderValueAssessment | null>;
  /**
   * Pinned rollback work must still be authorized by a live summary job at the
   * instant its paid request is recorded as sent. Ordinary discovery retains
   * its current-source authorization path.
   */
  authorizeDispatch(claim: ReaderValueAssessment, pinnedOnly: boolean): Promise<boolean>;
  complete(claim: ReaderValueAssessment, outcome: ReaderValueScoringOutcome): Promise<boolean>;
  findExact(scope: ReaderValueScope, id: string): Promise<ReaderValueAssessment | null>;
  read(scope: ReaderValueScope, interestId: string, references: readonly ReaderValueReference[]): Promise<readonly ReaderValueRead[]>;
  /** Reserve before summary's write-once manifest CAS; missing rows reject the whole set. */
  pin(scope: ReaderValueScope, interestId: string, jobId: string, references: readonly ReaderValueReference[]): Promise<boolean>;
  recoverExpiredLeases(scope: ReaderValueScope): Promise<number>;
  cleanup(scope: ReaderValueScope, policy: ReaderValueCleanupPolicy): Promise<ReaderValueCleanupResult>;
}
