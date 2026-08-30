export const activeReaderSummaryProvider = "codex" as const;
export const activeReaderSummaryModel = "gpt-5.6-sol" as const;
export const activeReaderSummaryReasoningEffort = "high" as const;

export const activeReaderSummaryPurposes = Object.freeze({
  generate: "social_monitor.reader_summary.generate.v2",
  repair: "social_monitor.reader_summary.repair.v2",
  topicLabel: "social_monitor.reader_summary.topic_map.label.v2",
  topicRelations:
    "social_monitor.reader_summary.topic_map.verify_relations.v2",
  storyRelations:
    "social_monitor.reader_summary.verify_story_relations.v2",
  relatedTopicRelations:
    "social_monitor.reader_summary.verify_related_topic_relations.v2",
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

export const parseActiveReaderSummaryModel = (
  value: string | undefined,
): typeof activeReaderSummaryModel | undefined =>
  parseOptionalExact(
    value,
    activeReaderSummaryModel,
    "AGENT_RUNTIME_READER_SUMMARY_MODEL must be gpt-5.6-sol",
  );

export const parseActiveReaderSummaryReasoningEffort = (
  value: string | undefined,
): typeof activeReaderSummaryReasoningEffort | undefined =>
  parseOptionalExact(
    value,
    activeReaderSummaryReasoningEffort,
    "AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT must be high",
  );

export const assertActiveReaderSummaryProvider = (
  value: string | undefined,
): typeof activeReaderSummaryProvider | undefined =>
  parseOptionalExact(
    value,
    activeReaderSummaryProvider,
    'AGENT_RUNTIME_PROVIDER must be "codex" for active reader summaries',
  );

const parseOptionalExact = <Expected extends string>(
  value: string | undefined,
  expected: Expected,
  message: string,
): Expected | undefined => {
  if (value === undefined || value.trim().length === 0) return undefined;
  if (value.trim() !== expected) throw new Error(message);
  return expected;
};
