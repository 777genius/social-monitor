import {
  activeReaderSummaryPurposes,
  frozenLegacyReaderSummaryRecoveryContract,
  type FrozenLegacyReaderSummaryRecoveryContract,
} from "./active-reader-summary-generation-profile";

/** Purpose authorization for attested task roles, independent of wire identity and sink I/O. */
export type ReaderSummaryAttestedTaskRole =
  | "summary"
  | "daily_editor"
  | "topic_label"
  | "topic_relation"
  | "story_relation"
  | "related_topic_relation"
  | "weekly_review"
  | "weekly_generate";

export const readerSummaryAttestedPurposeMatches = (
  role: ReaderSummaryAttestedTaskRole,
  attempt: string,
  purpose: string,
  legacyRecoveryContract?: FrozenLegacyReaderSummaryRecoveryContract,
): boolean => ({
  summary: legacyRecoveryContract === frozenLegacyReaderSummaryRecoveryContract
    ? attempt === "primary"
      ? [frozenLegacyReaderSummaryRecoveryContract.purposes.generate]
      : attempt === "repair"
        ? [frozenLegacyReaderSummaryRecoveryContract.purposes.repair]
        : []
    : attempt === "primary"
      ? [activeReaderSummaryPurposes.generate]
      : attempt === "repair"
        ? [activeReaderSummaryPurposes.repair]
        : [],
  daily_editor: attempt === "primary" ? [activeReaderSummaryPurposes.dailyEditorial] : [],
  topic_label: [activeReaderSummaryPurposes.topicLabel],
  topic_relation: [activeReaderSummaryPurposes.topicRelations],
  story_relation: [activeReaderSummaryPurposes.storyRelations],
  related_topic_relation: [activeReaderSummaryPurposes.relatedTopicRelations],
  weekly_review: [activeReaderSummaryPurposes.weeklyReview],
  weekly_generate: [activeReaderSummaryPurposes.weeklyGenerate],
} as const)[role].some((candidate: string) => candidate === purpose);
