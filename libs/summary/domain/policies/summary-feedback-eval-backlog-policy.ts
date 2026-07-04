import {
  type SummaryFeedback,
  type SummaryFeedbackCategory,
  summaryFeedbackCategories,
  type SummaryFeedbackEvidence,
  type SummaryFeedbackTriageOwner,
} from "../entities/summary-feedback";

export type SummaryFeedbackEvalBacklogLabel =
  | "factuality_regression"
  | "citation_regression"
  | "evidence_recall_regression"
  | "relevance_regression"
  | "style_quality_gap"
  | "source_request_signal"
  | "ux_quality_gap"
  | "support_triage_signal";

export type SummaryFeedbackEvalBacklogPriority =
  | "p0_blocker"
  | "p1_high"
  | "p2_medium"
  | "p3_low";

export type SummaryFeedbackEvalBacklogActionType =
  | "eval_fixture"
  | "citation_validator"
  | "ranking_tuning"
  | "summary_prompt_review"
  | "source_planner_review"
  | "runbook_action";

export type SummaryFeedbackEvalSuite =
  | "summary_quality"
  | "source_ranking"
  | "source_query_planner";

export type SummaryFeedbackEvalEvidenceRequirement =
  | "summary"
  | "interest"
  | "citation"
  | "feed_item"
  | "source_item"
  | "provider";

export type SummaryFeedbackEvalBacklogSignal = {
  readonly feedbackId: string;
  readonly category: SummaryFeedbackCategory;
  readonly rating?: number;
  readonly triageOwner?: SummaryFeedbackTriageOwner | string;
  readonly eligibleForEvalFixture: boolean;
  readonly releaseBlocking?: boolean;
  readonly summaryEvidence: SummaryFeedbackEvidence;
  readonly hardeningAction?: {
    readonly actionType?: string;
    readonly command?: string;
    readonly artifact?: string;
    readonly fixtureIds?: readonly string[];
    readonly exitCondition?: string;
  };
  readonly sourceArtifact?: string;
};

export type SummaryFeedbackEvalBacklogAction = {
  readonly actionType: SummaryFeedbackEvalBacklogActionType;
  readonly command: string;
  readonly artifact: string;
  readonly fixtureIds: readonly string[];
  readonly exitCondition: string;
};

export type SummaryFeedbackEvalBacklogItem = {
  readonly itemId: string;
  readonly feedbackId: string;
  readonly category: SummaryFeedbackCategory;
  readonly label: SummaryFeedbackEvalBacklogLabel;
  readonly priority: SummaryFeedbackEvalBacklogPriority;
  readonly triageOwner: string;
  readonly evalFixtureEligible: boolean;
  readonly releaseBlocking: boolean;
  readonly targetEvalSuites: readonly SummaryFeedbackEvalSuite[];
  readonly requiredEvidence: readonly SummaryFeedbackEvalEvidenceRequirement[];
  readonly missingEvidence: readonly SummaryFeedbackEvalEvidenceRequirement[];
  readonly summaryEvidence: SummaryFeedbackEvidence;
  readonly recommendedAction: SummaryFeedbackEvalBacklogAction;
  readonly reasonCodes: readonly string[];
  readonly sourceArtifact?: string;
};

type CategoryDecision = {
  readonly label: SummaryFeedbackEvalBacklogLabel;
  readonly defaultPriority: SummaryFeedbackEvalBacklogPriority;
  readonly lowRatingPriority?: SummaryFeedbackEvalBacklogPriority;
  readonly targetEvalSuites: readonly SummaryFeedbackEvalSuite[];
  readonly actionType: SummaryFeedbackEvalBacklogActionType;
  readonly command: string;
  readonly artifact: string;
  readonly fixtureIds: readonly string[];
  readonly exitCondition: string;
  readonly reasonCodes: readonly string[];
};

const CATEGORY_DECISIONS: Record<SummaryFeedbackCategory, CategoryDecision> = {
  wrong_fact: {
    label: "factuality_regression",
    defaultPriority: "p0_blocker",
    targetEvalSuites: ["summary_quality"],
    actionType: "eval_fixture",
    command: "npm run check:summary-evals",
    artifact: "ops/evals/summary-eval-output.json",
    fixtureIds: ["feedback-wrong-fact-grounding"],
    exitCondition:
      "Wrong-fact feedback must remain covered by a blocking grounding eval.",
    reasonCodes: ["claim_not_grounded", "summary_quality_blocker"],
  },
  missing_source: {
    label: "evidence_recall_regression",
    defaultPriority: "p1_high",
    lowRatingPriority: "p1_high",
    targetEvalSuites: ["summary_quality", "source_ranking"],
    actionType: "ranking_tuning",
    command: "npm run check:summary-evals && npm run check:source-ranking-eval",
    artifact: "ops/evals/source-ranking-eval-output.json",
    fixtureIds: [],
    exitCondition:
      "Missed-source feedback must be represented in evidence selection or ranking evals before tuning defaults.",
    reasonCodes: ["important_evidence_missing", "evidence_selector_recall"],
  },
  bad_citation: {
    label: "citation_regression",
    defaultPriority: "p0_blocker",
    targetEvalSuites: ["summary_quality"],
    actionType: "citation_validator",
    command: "npm run check:summary-evals",
    artifact: "ops/evals/summary-eval-output.json",
    fixtureIds: ["feedback-bad-citation-grounding"],
    exitCondition:
      "Bad-citation feedback must remain covered by a citation-grounding regression.",
    reasonCodes: ["citation_does_not_support_claim", "summary_quality_blocker"],
  },
  low_relevance: {
    label: "relevance_regression",
    defaultPriority: "p2_medium",
    lowRatingPriority: "p1_high",
    targetEvalSuites: ["source_ranking", "summary_quality"],
    actionType: "ranking_tuning",
    command: "npm run check:source-ranking-eval && npm run check:summary-evals",
    artifact: "ops/evals/source-ranking-eval-output.json",
    fixtureIds: [],
    exitCondition:
      "Low-relevance feedback must be converted into ranking labels or summary fixtures before changing scorer weights.",
    reasonCodes: ["low_topic_match", "ranking_quality"],
  },
  too_verbose: {
    label: "style_quality_gap",
    defaultPriority: "p3_low",
    lowRatingPriority: "p2_medium",
    targetEvalSuites: ["summary_quality"],
    actionType: "summary_prompt_review",
    command: "npm run check:summary-evals",
    artifact: "ops/evals/summary-eval-output.json",
    fixtureIds: [],
    exitCondition:
      "Verbose-summary feedback must be represented in summary quality criteria before prompt changes.",
    reasonCodes: ["summary_too_verbose", "presentation_quality"],
  },
  too_terse: {
    label: "style_quality_gap",
    defaultPriority: "p3_low",
    lowRatingPriority: "p2_medium",
    targetEvalSuites: ["summary_quality"],
    actionType: "summary_prompt_review",
    command: "npm run check:summary-evals",
    artifact: "ops/evals/summary-eval-output.json",
    fixtureIds: [],
    exitCondition:
      "Too-terse feedback must be represented in summary quality criteria before prompt changes.",
    reasonCodes: ["summary_too_terse", "presentation_quality"],
  },
  source_request: {
    label: "source_request_signal",
    defaultPriority: "p2_medium",
    targetEvalSuites: ["source_query_planner"],
    actionType: "source_planner_review",
    command: "npm run check:source-query-planner-eval",
    artifact: "ops/evals/source-query-planner-eval-output.json",
    fixtureIds: [],
    exitCondition:
      "Source requests stay demand signals until source readiness and query planner evals support the provider.",
    reasonCodes: ["source_demand", "not_summary_eval_fixture"],
  },
  ux_confusing: {
    label: "ux_quality_gap",
    defaultPriority: "p3_low",
    lowRatingPriority: "p2_medium",
    targetEvalSuites: [],
    actionType: "runbook_action",
    command: "npm run check:summary-feedback-hardening",
    artifact: "ops/release/summary-feedback-hardening-evidence.json",
    fixtureIds: [],
    exitCondition:
      "UX feedback remains triaged outside scoring evals until a product workflow regression is defined.",
    reasonCodes: ["ux_comprehension_gap", "product_triage"],
  },
  other: {
    label: "support_triage_signal",
    defaultPriority: "p3_low",
    lowRatingPriority: "p2_medium",
    targetEvalSuites: [],
    actionType: "runbook_action",
    command: "npm run check:summary-feedback-hardening",
    artifact: "ops/release/summary-feedback-hardening-evidence.json",
    fixtureIds: [],
    exitCondition:
      "Other feedback must stay owner-routed and not silently mutate scoring policy.",
    reasonCodes: ["support_triage", "manual_review_required"],
  },
};

const citationEvidenceCategories = new Set<SummaryFeedbackCategory>([
  "wrong_fact",
  "missing_source",
  "bad_citation",
]);

const priorityRank: Record<SummaryFeedbackEvalBacklogPriority, number> = {
  p0_blocker: 0,
  p1_high: 1,
  p2_medium: 2,
  p3_low: 3,
};

export const buildSummaryFeedbackEvalBacklog = (
  signals: readonly SummaryFeedbackEvalBacklogSignal[],
): readonly SummaryFeedbackEvalBacklogItem[] => {
  const deduped = new Map<string, SummaryFeedbackEvalBacklogItem>();

  for (const signal of signals) {
    const item = buildSummaryFeedbackEvalBacklogItem(signal);
    const existing = deduped.get(item.feedbackId);

    if (
      existing === undefined ||
      priorityRank[item.priority] < priorityRank[existing.priority]
    ) {
      deduped.set(item.feedbackId, item);
    }
  }

  return [...deduped.values()].sort(compareBacklogItems);
};

export const buildSummaryFeedbackEvalBacklogItem = (
  signal: SummaryFeedbackEvalBacklogSignal,
): SummaryFeedbackEvalBacklogItem => {
  const decision = CATEGORY_DECISIONS[signal.category];
  const requiredEvidence = requiredEvidenceFor(signal.category);
  const missingEvidence = missingEvidenceFor(
    signal.summaryEvidence,
    requiredEvidence,
  );
  const evalFixtureEligible =
    signal.eligibleForEvalFixture && decision.targetEvalSuites.length > 0;
  const releaseBlocking =
    signal.releaseBlocking === true ||
    decision.defaultPriority === "p0_blocker";

  return {
    itemId: `summary-feedback-eval-${signal.feedbackId}`,
    feedbackId: signal.feedbackId,
    category: signal.category,
    label: decision.label,
    priority: priorityFor(signal, decision),
    triageOwner: signal.triageOwner ?? "summary-owner",
    evalFixtureEligible,
    releaseBlocking,
    targetEvalSuites: decision.targetEvalSuites,
    requiredEvidence,
    missingEvidence,
    summaryEvidence: { ...signal.summaryEvidence },
    recommendedAction: actionFor(signal, decision),
    reasonCodes: reasonCodesFor(signal, decision, {
      evalFixtureEligible,
      missingEvidence,
      releaseBlocking,
    }),
    sourceArtifact: signal.sourceArtifact,
  };
};

export const summaryFeedbackToEvalBacklogSignal = (
  feedback: SummaryFeedback,
): SummaryFeedbackEvalBacklogSignal => {
  const snapshot = feedback.toSnapshot();

  return {
    feedbackId: snapshot.id,
    category: snapshot.category,
    rating: snapshot.rating,
    triageOwner: snapshot.triageOwner,
    eligibleForEvalFixture: snapshot.eligibleForEvalFixture,
    summaryEvidence: snapshot.evidence,
  };
};

export const summaryFeedbackEvalBacklogPolicyCoverage = (): readonly {
  readonly category: SummaryFeedbackCategory;
  readonly label: SummaryFeedbackEvalBacklogLabel;
  readonly defaultPriority: SummaryFeedbackEvalBacklogPriority;
  readonly targetEvalSuites: readonly SummaryFeedbackEvalSuite[];
  readonly actionType: SummaryFeedbackEvalBacklogActionType;
}[] =>
  summaryFeedbackCategories.map((category) => {
    const decision = CATEGORY_DECISIONS[category];

    return {
      category,
      label: decision.label,
      defaultPriority: decision.defaultPriority,
      targetEvalSuites: decision.targetEvalSuites,
      actionType: decision.actionType,
    };
  });

const priorityFor = (
  signal: SummaryFeedbackEvalBacklogSignal,
  decision: CategoryDecision,
): SummaryFeedbackEvalBacklogPriority => {
  if (
    signal.rating !== undefined &&
    signal.rating <= 2 &&
    decision.lowRatingPriority !== undefined
  ) {
    return decision.lowRatingPriority;
  }

  return decision.defaultPriority;
};

const actionFor = (
  signal: SummaryFeedbackEvalBacklogSignal,
  decision: CategoryDecision,
): SummaryFeedbackEvalBacklogAction => ({
  actionType: normalizeActionType(signal.hardeningAction?.actionType, decision),
  command: nonEmpty(signal.hardeningAction?.command) ?? decision.command,
  artifact: nonEmpty(signal.hardeningAction?.artifact) ?? decision.artifact,
  fixtureIds: signal.hardeningAction?.fixtureIds ?? decision.fixtureIds,
  exitCondition:
    nonEmpty(signal.hardeningAction?.exitCondition) ?? decision.exitCondition,
});

const normalizeActionType = (
  value: string | undefined,
  decision: CategoryDecision,
): SummaryFeedbackEvalBacklogActionType => {
  if (value === "eval_fixture") {
    return "eval_fixture";
  }

  if (value === "validator_change") {
    return "citation_validator";
  }

  if (value === "runbook_action") {
    return decision.actionType;
  }

  return decision.actionType;
};

const requiredEvidenceFor = (
  category: SummaryFeedbackCategory,
): readonly SummaryFeedbackEvalEvidenceRequirement[] =>
  citationEvidenceCategories.has(category)
    ? ["summary", "interest", "citation", "feed_item", "source_item", "provider"]
    : ["summary", "interest"];

const missingEvidenceFor = (
  evidence: SummaryFeedbackEvidence,
  requiredEvidence: readonly SummaryFeedbackEvalEvidenceRequirement[],
): readonly SummaryFeedbackEvalEvidenceRequirement[] =>
  requiredEvidence.filter((requirement) => {
    if (requirement === "summary") {
      return evidence.summaryId.trim().length === 0;
    }
    if (requirement === "interest") {
      return evidence.interestId.trim().length === 0;
    }
    if (requirement === "citation") {
      return nonEmpty(evidence.citationId) === undefined;
    }
    if (requirement === "feed_item") {
      return nonEmpty(evidence.feedItemId) === undefined;
    }
    if (requirement === "source_item") {
      return nonEmpty(evidence.sourceItemId) === undefined;
    }

    return nonEmpty(evidence.providerKey) === undefined;
  });

const reasonCodesFor = (
  signal: SummaryFeedbackEvalBacklogSignal,
  decision: CategoryDecision,
  result: {
    readonly evalFixtureEligible: boolean;
    readonly missingEvidence: readonly SummaryFeedbackEvalEvidenceRequirement[];
    readonly releaseBlocking: boolean;
  },
): readonly string[] => {
  const reasonCodes = [
    `category:${signal.category}`,
    `label:${decision.label}`,
    ...decision.reasonCodes,
  ];

  if (signal.rating !== undefined && signal.rating <= 2) {
    reasonCodes.push("low_rating");
  }

  if (result.evalFixtureEligible) {
    reasonCodes.push("eval_fixture_candidate");
  }

  if (result.releaseBlocking) {
    reasonCodes.push("release_blocking");
  }

  if (result.missingEvidence.length > 0) {
    reasonCodes.push("evidence_incomplete");
  }

  return [...new Set(reasonCodes)].sort();
};

const compareBacklogItems = (
  left: SummaryFeedbackEvalBacklogItem,
  right: SummaryFeedbackEvalBacklogItem,
): number => {
  const priorityDelta = priorityRank[left.priority] - priorityRank[right.priority];

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const labelDelta = left.label.localeCompare(right.label);
  if (labelDelta !== 0) {
    return labelDelta;
  }

  return left.feedbackId.localeCompare(right.feedbackId);
};

const nonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};
