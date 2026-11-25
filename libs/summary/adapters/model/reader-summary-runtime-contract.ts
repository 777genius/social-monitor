export const activeReaderSummaryProvider = "codex" as const;

export const mimoReaderSummaryBackend = "xiaomi-mimo-token-plan" as const;
export const mimoReaderSummaryModel = "mimo-v2.6-pro" as const;
export const mimoPresentationReasoningEffort = "none" as const;
// At most 32 independent story tasks must fit inside the daily execution lease.
export const mimoPresentationMaxTimeoutMs = 60_000;


export const activeReaderSummaryPurposes = Object.freeze({
  generate: "social_monitor.reader_summary.generate.v2",
  dailyEditorial: "social_monitor.reader_summary.daily_editorial.plan.v1",
  repair: "social_monitor.reader_summary.repair.v2",
  topicLabel: "social_monitor.reader_summary.topic_map.label.v2",
  topicRelations:
    "social_monitor.reader_summary.topic_map.verify_relations.v2",
  storyRelations:
    "social_monitor.reader_summary.verify_story_relations.v2",
  relatedTopicRelations:
    "social_monitor.reader_summary.verify_related_topic_relations.v2",
  promotionPresentation:
    "social_monitor.reader_summary.promotion_presentation.v3",
  dailyCanonicalRecovery:
    "social_monitor.reader_summary.daily.canonical_recovery.v2",
  weeklyReview: "social_monitor.reader_summary.weekly.review.v2",
  weeklyGenerate: "social_monitor.reader_summary.weekly.generate.v2",
} as const);


export const frozenLegacyReaderSummaryRecoveryContract = Object.freeze({
  recoveryOnly: true,
  reasoningEffort: "xhigh",
  purposes: Object.freeze({
    generate: "social_monitor.reader_summary.generate",
    repair: "social_monitor.reader_summary.repair",
  }),
} as const);

export type FrozenLegacyReaderSummaryRecoveryContract =
  typeof frozenLegacyReaderSummaryRecoveryContract;

