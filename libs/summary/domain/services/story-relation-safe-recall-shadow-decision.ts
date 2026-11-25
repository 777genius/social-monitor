import {
  reconcileStoryRelationDecisions,
  terminalStoryRelationDecisionTraces,
  type StoryRelationDecisionDisposition,
  type StoryRelationDecisionFailureReason,
  type StoryRelationDecisionTrace,
} from "./story-relation-decision-trace";
import {
  STORY_RELATION_SAFE_RECALL_SHADOW_POLICY_VERSION,
  type StoryRelationSafeRecallShadowCandidate,
  type StoryRelationSafeRecallShadowReasonCode,
} from "./story-relation-safe-recall-shadow";

export type StoryRelationSafeRecallShadowDecisionTrace = Omit<
  StoryRelationDecisionTrace,
  "candidatePolicyVersion" | "applied"
> & {
  readonly candidatePolicyVersion: typeof STORY_RELATION_SAFE_RECALL_SHADOW_POLICY_VERSION;
  readonly shadowReasonCode: StoryRelationSafeRecallShadowReasonCode;
  readonly wouldApprove: boolean;
  /** Shadow decisions are observational and can never be applied. */
  readonly applied: false;
};

export type StoryRelationSafeRecallShadowDecisionAggregate = {
  readonly shadowReasonCode: StoryRelationSafeRecallShadowReasonCode;
  readonly disposition: StoryRelationDecisionDisposition;
  readonly failureReason?: StoryRelationDecisionFailureReason;
  readonly rankingPolicyVersion: string;
  readonly candidatePolicyVersion: typeof STORY_RELATION_SAFE_RECALL_SHADOW_POLICY_VERSION;
  readonly count: number;
};

export type StoryRelationSafeRecallShadowDecisionBatch = {
  readonly responseAccepted: boolean;
  readonly wouldApproveCount: number;
  readonly traces: readonly StoryRelationSafeRecallShadowDecisionTrace[];
  readonly aggregates: readonly StoryRelationSafeRecallShadowDecisionAggregate[];
};

export const reconcileStoryRelationSafeRecallShadowDecisions = (params: {
  readonly candidates: readonly StoryRelationSafeRecallShadowCandidate[];
  readonly decisions: readonly unknown[];
  readonly rankingPolicyVersion: string;
  readonly approvalThreshold: number;
}): StoryRelationSafeRecallShadowDecisionBatch => {
  const reconciled = reconcileStoryRelationDecisions({
    candidates: params.candidates,
    decisions: params.decisions,
    rankingPolicyVersion: params.rankingPolicyVersion,
    approvalThreshold: params.approvalThreshold,
  });
  const traces = shadowTraces(params.candidates, reconciled.traces);
  return {
    responseAccepted: reconciled.responseAccepted,
    wouldApproveCount: reconciled.approvedPairs.size,
    traces,
    aggregates: aggregateStoryRelationSafeRecallShadowTraces(traces),
  };
};

export const terminalStoryRelationSafeRecallShadowTraces = (params: {
  readonly candidates: readonly StoryRelationSafeRecallShadowCandidate[];
  readonly rankingPolicyVersion: string;
  readonly approvalThreshold: number;
  readonly disposition:
    | "verifier_unavailable"
    | "verifier_skipped"
    | "verifier_failed_closed";
  readonly failureReason?: StoryRelationDecisionFailureReason;
}): readonly StoryRelationSafeRecallShadowDecisionTrace[] =>
  shadowTraces(
    params.candidates,
    terminalStoryRelationDecisionTraces({
      candidates: params.candidates,
      rankingPolicyVersion: params.rankingPolicyVersion,
      approvalThreshold: params.approvalThreshold,
      disposition: params.disposition,
      ...(params.failureReason === undefined
        ? {}
        : { failureReason: params.failureReason }),
    }),
  );

export const aggregateStoryRelationSafeRecallShadowTraces = (
  traces: readonly StoryRelationSafeRecallShadowDecisionTrace[],
): readonly StoryRelationSafeRecallShadowDecisionAggregate[] => {
  const aggregates = new Map<
    string,
    StoryRelationSafeRecallShadowDecisionAggregate
  >();
  for (const trace of traces) {
    const key = [
      trace.shadowReasonCode,
      trace.disposition,
      trace.failureReason ?? "none",
      trace.rankingPolicyVersion,
      trace.candidatePolicyVersion,
    ].join("\u0000");
    const current = aggregates.get(key);
    aggregates.set(key, {
      shadowReasonCode: trace.shadowReasonCode,
      disposition: trace.disposition,
      ...(trace.failureReason === undefined
        ? {}
        : { failureReason: trace.failureReason }),
      rankingPolicyVersion: trace.rankingPolicyVersion,
      candidatePolicyVersion: trace.candidatePolicyVersion,
      count: (current?.count ?? 0) + 1,
    });
  }
  return [...aggregates.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, aggregate]) => aggregate);
};

const shadowTraces = (
  candidates: readonly StoryRelationSafeRecallShadowCandidate[],
  traces: readonly StoryRelationDecisionTrace[],
): readonly StoryRelationSafeRecallShadowDecisionTrace[] => {
  if (candidates.length !== traces.length) {
    throw new Error("Safe-recall shadow trace cardinality must match candidates");
  }
  return traces.map((trace, index) => {
    const candidate = candidates[index];
    if (candidate === undefined) {
      throw new Error("Safe-recall shadow trace candidate is missing");
    }
    return {
      ...trace,
      candidatePolicyVersion: STORY_RELATION_SAFE_RECALL_SHADOW_POLICY_VERSION,
      shadowReasonCode: candidate.shadowReasonCode,
      wouldApprove: trace.disposition === "approved",
      applied: false,
    };
  });
};
