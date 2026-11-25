import { verifiedStoryRelationPairKey } from "./story-cluster-membership";
import type {
  StoryRelationCandidate,
  StoryRelationDecision,
} from "./story-relation-candidates";
import { STORY_RELATION_APPROVAL_CONFIDENCE_MIN } from "./story-relation-candidates";

export const STORY_RELATION_CANDIDATE_POLICY_VERSION =
  "reader_summary.story_relation.candidate.v2";

export type StoryRelationDecisionDisposition =
  | "verifier_unavailable"
  | "verifier_skipped"
  | "approved"
  | "rejected_same_story_false"
  | "rejected_below_confidence"
  | "verifier_failed_closed";

export type StoryRelationDecisionFailureReason =
  | "envelope_invalid_shape"
  | "envelope_missing_decisions"
  | "envelope_unknown_property"
  | "decision_invalid_shape"
  | "decision_missing_property"
  | "decision_unknown_property"
  | "decision_confidence_not_finite"
  | "decision_confidence_out_of_range"
  | "unmatched_response"
  | "duplicate_response"
  | "missing_response"
  | "verifier_exception";

/**
 * Starts at the materialized shortlist boundary. Pairs rejected before
 * shortlisting or dropped by shortlist bounds are deliberately outside this
 * candidate-decision trace until a separate generation audit exists.
 */
export type StoryRelationDecisionTrace = {
  /** In-memory identity only. Metrics adapters must never use this as a label. */
  readonly pairId: string;
  readonly rankingPolicyVersion: string;
  readonly candidatePolicyVersion: typeof STORY_RELATION_CANDIDATE_POLICY_VERSION;
  readonly approvalThreshold: number;
  readonly shortlistRank: number;
  readonly features: {
    readonly sharedTopicTokenCount: number;
    readonly sharedAnchorTokenCount: number;
    readonly sharedEventTokenCount: number;
    readonly sharedSpecificProductTokenCount: number;
    readonly topicSimilarity: number;
  };
  readonly disposition: StoryRelationDecisionDisposition;
  readonly failureReason?: StoryRelationDecisionFailureReason;
  readonly sameStory?: boolean;
  readonly confidenceScore?: number;
  readonly rationalePresent?: boolean;
  /** Bounded count only; verifier rationale text is never retained. */
  readonly rationaleCharacterCount?: number;
  readonly applied: boolean;
};

export type StoryRelationDecisionBatch = {
  readonly approvedPairs: ReadonlySet<string>;
  readonly traces: readonly StoryRelationDecisionTrace[];
  readonly responseAccepted: boolean;
};

export type StoryRelationDecisionAggregate = {
  readonly disposition: StoryRelationDecisionDisposition;
  readonly failureReason?: StoryRelationDecisionFailureReason;
  readonly rankingPolicyVersion: string;
  readonly candidatePolicyVersion: typeof STORY_RELATION_CANDIDATE_POLICY_VERSION;
  readonly count: number;
};

export const reconcileStoryRelationDecisions = (params: {
  readonly candidates: readonly StoryRelationCandidate[];
  readonly decisions: readonly unknown[];
  readonly rankingPolicyVersion: string;
  readonly approvalThreshold: number;
}): StoryRelationDecisionBatch => {
  const candidatesByPair = new Map(
    params.candidates.map((candidate) => [candidatePairId(candidate), candidate]),
  );
  const decisionsByPair = new Map<string, StoryRelationDecision[]>();
  const invalidReasonsByPair = new Map<
    string,
    StoryRelationDecisionFailureReason
  >();
  let hasUnmatchedResponse = false;
  let unpairedInvalidReason: StoryRelationDecisionFailureReason | undefined;

  for (const decision of params.decisions) {
    const validation = validateDecision(decision);
    if (!validation.valid) {
      if (validation.pairId === undefined) {
        unpairedInvalidReason ??= validation.reason;
      } else {
        invalidReasonsByPair.set(validation.pairId, validation.reason);
      }
      continue;
    }
    const pairId = decisionPairId(validation.decision);
    if (!candidatesByPair.has(pairId)) {
      hasUnmatchedResponse = true;
      continue;
    }
    const matches = decisionsByPair.get(pairId) ?? [];
    decisionsByPair.set(pairId, [...matches, validation.decision]);
  }

  const responseAccepted =
    !hasUnmatchedResponse &&
    unpairedInvalidReason === undefined &&
    invalidReasonsByPair.size === 0 &&
    params.candidates.every((candidate) => {
      const matches = decisionsByPair.get(candidatePairId(candidate));
      return (
        matches?.length === 1 &&
        isValidDecision(matches[0] as StoryRelationDecision)
      );
    });

  if (!responseAccepted) {
    const batchFailureReason = failureReasonForRejectedBatch({
      candidates: params.candidates,
      decisionsByPair,
      invalidReasonsByPair,
      hasUnmatchedResponse,
      unpairedInvalidReason,
    });
    return {
      approvedPairs: new Set(),
      responseAccepted: false,
      traces: params.candidates.map((candidate, index) => {
        const matches = decisionsByPair.get(candidatePairId(candidate)) ?? [];
        const failureReason =
          invalidReasonsByPair.get(candidatePairId(candidate)) ??
          (matches.length > 1 ? "duplicate_response" : batchFailureReason);
        return traceFor({
          candidate,
          shortlistRank: index + 1,
          rankingPolicyVersion: params.rankingPolicyVersion,
          approvalThreshold: params.approvalThreshold,
          disposition: "verifier_failed_closed",
          failureReason,
          decision: matches.length === 1 ? matches[0] : undefined,
          applied: false,
        });
      }),
    };
  }

  const approvedPairs = new Set<string>();
  const traces = params.candidates.map((candidate, index) => {
    const decision = decisionsByPair.get(candidatePairId(candidate))?.[0];
    if (decision === undefined) {
      throw new Error("Accepted story relation response is incomplete");
    }
    const applied =
      decision.sameStory &&
      decision.confidenceScore >= params.approvalThreshold;
    if (applied) {
      approvedPairs.add(candidatePairId(candidate));
    }
    return traceFor({
      candidate,
      shortlistRank: index + 1,
      rankingPolicyVersion: params.rankingPolicyVersion,
      approvalThreshold: params.approvalThreshold,
      disposition: applied
        ? "approved"
        : decision.sameStory
          ? "rejected_below_confidence"
          : "rejected_same_story_false",
      decision,
      applied,
    });
  });

  return { approvedPairs, traces, responseAccepted: true };
};

const failureReasonForRejectedBatch = (params: {
  readonly candidates: readonly StoryRelationCandidate[];
  readonly decisionsByPair: ReadonlyMap<string, readonly StoryRelationDecision[]>;
  readonly invalidReasonsByPair: ReadonlyMap<
    string,
    StoryRelationDecisionFailureReason
  >;
  readonly hasUnmatchedResponse: boolean;
  readonly unpairedInvalidReason?: StoryRelationDecisionFailureReason;
}): StoryRelationDecisionFailureReason => {
  if (params.hasUnmatchedResponse) {
    return "unmatched_response";
  }
  if (params.unpairedInvalidReason !== undefined) {
    return params.unpairedInvalidReason;
  }
  const pairedInvalidReason = params.invalidReasonsByPair.values().next().value;
  if (pairedInvalidReason !== undefined) {
    return pairedInvalidReason;
  }
  if (
    params.candidates.some(
      (candidate) =>
        (params.decisionsByPair.get(candidatePairId(candidate))?.length ?? 0) > 1,
    )
  ) {
    return "duplicate_response";
  }
  return "missing_response";
};

export const terminalStoryRelationDecisionTraces = (params: {
  readonly candidates: readonly StoryRelationCandidate[];
  readonly rankingPolicyVersion: string;
  readonly approvalThreshold: number;
  readonly disposition:
    | "verifier_unavailable"
    | "verifier_skipped"
    | "verifier_failed_closed";
  readonly failureReason?: StoryRelationDecisionFailureReason;
}): readonly StoryRelationDecisionTrace[] =>
  params.candidates.map((candidate, index) =>
    traceFor({
      candidate,
      shortlistRank: index + 1,
      rankingPolicyVersion: params.rankingPolicyVersion,
      approvalThreshold: params.approvalThreshold,
      disposition: params.disposition,
      failureReason: params.failureReason,
      applied: false,
    }),
  );

const traceFor = (params: {
  readonly candidate: StoryRelationCandidate;
  readonly shortlistRank: number;
  readonly rankingPolicyVersion: string;
  readonly approvalThreshold: number;
  readonly disposition: StoryRelationDecisionDisposition;
  readonly failureReason?: StoryRelationDecisionFailureReason;
  readonly decision?: StoryRelationDecision;
  readonly applied: boolean;
}): StoryRelationDecisionTrace => ({
  pairId: candidatePairId(params.candidate),
  rankingPolicyVersion: params.rankingPolicyVersion,
  candidatePolicyVersion: STORY_RELATION_CANDIDATE_POLICY_VERSION,
  approvalThreshold: params.approvalThreshold,
  shortlistRank: params.shortlistRank,
  features: {
    sharedTopicTokenCount: params.candidate.sharedTopicTokens.length,
    sharedAnchorTokenCount: params.candidate.sharedAnchorTokens.length,
    sharedEventTokenCount: params.candidate.sharedEventTokens.length,
    sharedSpecificProductTokenCount:
      params.candidate.sharedSpecificProductTokens.length,
    topicSimilarity: params.candidate.topicSimilarity,
  },
  disposition: params.disposition,
  ...(params.failureReason === undefined
    ? {}
    : { failureReason: params.failureReason }),
  ...(params.decision === undefined
    ? {}
    : {
        sameStory: params.decision.sameStory,
        ...(Number.isFinite(params.decision.confidenceScore)
          ? { confidenceScore: params.decision.confidenceScore }
          : {}),
        rationalePresent: Boolean(params.decision.rationale),
        rationaleCharacterCount: boundedRationaleCharacterCount(
          params.decision.rationale,
        ),
      }),
  applied: params.applied,
});

const boundedRationaleCharacterCount = (rationale: string | undefined): number =>
  Math.min(rationale === undefined ? 0 : [...rationale].length, 4_096);

const decisionProperties = new Set([
  "leftFeedItemId",
  "rightFeedItemId",
  "sameStory",
  "confidenceScore",
  "rationale",
]);

type DecisionValidation =
  | { readonly valid: true; readonly decision: StoryRelationDecision }
  | {
      readonly valid: false;
      readonly reason: StoryRelationDecisionFailureReason;
      readonly pairId?: string;
    };

const validateDecision = (decision: unknown): DecisionValidation => {
  if (
    decision === null ||
    typeof decision !== "object" ||
    Array.isArray(decision)
  ) {
    return { valid: false, reason: "decision_invalid_shape" };
  }
  const value = decision as Record<string, unknown>;
  const pairId = decisionPairIdWhenPresent(value);
  if (Object.keys(value).some((property) => !decisionProperties.has(property))) {
    return invalidDecision(
      "decision_unknown_property",
      pairId,
    );
  }
  if (
    !("leftFeedItemId" in value) ||
    !("rightFeedItemId" in value) ||
    !("sameStory" in value) ||
    !("confidenceScore" in value)
  ) {
    return invalidDecision("decision_missing_property", pairId);
  }
  if (
    typeof value.leftFeedItemId !== "string" ||
    value.leftFeedItemId.trim().length === 0 ||
    typeof value.rightFeedItemId !== "string" ||
    value.rightFeedItemId.trim().length === 0 ||
    typeof value.sameStory !== "boolean" ||
    typeof value.confidenceScore !== "number" ||
    ((value.rationale !== undefined || "rationale" in value) &&
      typeof value.rationale !== "string")
  ) {
    return invalidDecision("decision_invalid_shape", pairId);
  }
  if (!Number.isFinite(value.confidenceScore)) {
    return invalidDecision("decision_confidence_not_finite", pairId);
  }
  if (value.confidenceScore < 0 || value.confidenceScore > 1) {
    return invalidDecision("decision_confidence_out_of_range", pairId);
  }
  return {
    valid: true,
    decision: {
      leftFeedItemId: value.leftFeedItemId.trim(),
      rightFeedItemId: value.rightFeedItemId.trim(),
      sameStory: value.sameStory,
      confidenceScore: value.confidenceScore,
      ...(value.rationale === undefined
        ? {}
        : { rationale: value.rationale.trim() }),
    },
  };
};

const invalidDecision = (
  reason: StoryRelationDecisionFailureReason,
  pairId?: string,
): DecisionValidation => ({
  valid: false,
  reason,
  ...(pairId === undefined ? {} : { pairId }),
});

const isValidDecision = (decision: StoryRelationDecision): boolean =>
  validateDecision(decision).valid;

const decisionPairIdWhenPresent = (
  value: Record<string, unknown>,
): string | undefined =>
  typeof value.leftFeedItemId === "string" &&
  value.leftFeedItemId.trim().length > 0 &&
  typeof value.rightFeedItemId === "string" &&
  value.rightFeedItemId.trim().length > 0
    ? verifiedStoryRelationPairKey(
        value.leftFeedItemId.trim(),
        value.rightFeedItemId.trim(),
      )
    : undefined;

export const aggregateStoryRelationDecisionTraces = (
  traces: readonly StoryRelationDecisionTrace[],
): readonly StoryRelationDecisionAggregate[] => {
  const aggregates = new Map<string, StoryRelationDecisionAggregate>();
  for (const trace of traces) {
    const key = [
      trace.disposition,
      trace.failureReason ?? "none",
      trace.rankingPolicyVersion,
      trace.candidatePolicyVersion,
    ].join("\u0000");
    const current = aggregates.get(key);
    aggregates.set(key, {
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

/** Compatibility projection; reconciliation policy remains owned above. */
export const approvedStoryRelationPairs = (params: {
  readonly candidates: readonly StoryRelationCandidate[];
  readonly decisions: readonly StoryRelationDecision[];
  readonly minimumConfidence?: number;
}): ReadonlySet<string> =>
  reconcileStoryRelationDecisions({
    candidates: params.candidates,
    decisions: params.decisions,
    rankingPolicyVersion: "compatibility_projection",
    approvalThreshold:
      params.minimumConfidence ?? STORY_RELATION_APPROVAL_CONFIDENCE_MIN,
  }).approvedPairs;

const candidatePairId = (candidate: StoryRelationCandidate): string =>
  verifiedStoryRelationPairKey(
    candidate.leftFeedItemId,
    candidate.rightFeedItemId,
  );

const decisionPairId = (decision: StoryRelationDecision): string =>
  verifiedStoryRelationPairKey(
    decision.leftFeedItemId,
    decision.rightFeedItemId,
  );
