import {
  activeReaderSummaryPurposes,
  frozenLegacyReaderSummaryRecoveryContract,
} from "./active-reader-summary-generation-profile";
import {
  readerSummaryAttestedPurposeMatches,
  type ReaderSummaryAttestedTaskRole,
} from "./reader-summary-attested-purpose-policy";

const allowed: readonly {
  readonly role: ReaderSummaryAttestedTaskRole;
  readonly attempt: string;
  readonly purpose: string;
}[] = [
  { role: "summary", attempt: "primary", purpose: activeReaderSummaryPurposes.generate },
  { role: "summary", attempt: "repair", purpose: activeReaderSummaryPurposes.repair },
  { role: "daily_editor", attempt: "primary", purpose: activeReaderSummaryPurposes.dailyEditorial },
  { role: "topic_label", attempt: "primary", purpose: activeReaderSummaryPurposes.topicLabel },
  { role: "topic_relation", attempt: "primary", purpose: activeReaderSummaryPurposes.topicRelations },
  { role: "story_relation", attempt: "primary", purpose: activeReaderSummaryPurposes.storyRelations },
  { role: "related_topic_relation", attempt: "primary", purpose: activeReaderSummaryPurposes.relatedTopicRelations },
  { role: "weekly_review", attempt: "primary", purpose: activeReaderSummaryPurposes.weeklyReview },
  { role: "weekly_generate", attempt: "primary", purpose: activeReaderSummaryPurposes.weeklyGenerate },
];

describe("attested reader-summary task-role purpose policy", () => {
  it.each(allowed)("admits the exact $role / $attempt / $purpose binding", ({ role, attempt, purpose }) => {
    expect(readerSummaryAttestedPurposeMatches(role, attempt, purpose)).toBe(true);
  });

  it.each(allowed)("rejects a forged presentation purpose for $role", ({ role, attempt }) => {
    expect(readerSummaryAttestedPurposeMatches(
      role, attempt, activeReaderSummaryPurposes.promotionPresentation,
    )).toBe(false);
  });

  it("allows only primary/repair purposes for summary, never a renamed attempt", () => {
    expect(readerSummaryAttestedPurposeMatches(
      "summary", "retry", activeReaderSummaryPurposes.generate,
    )).toBe(false);
    expect(readerSummaryAttestedPurposeMatches(
      "summary", "primary", activeReaderSummaryPurposes.repair,
    )).toBe(false);
    expect(readerSummaryAttestedPurposeMatches(
      "daily_editor", "repair", activeReaderSummaryPurposes.dailyEditorial,
    )).toBe(false);
  });

  it("binds frozen recovery to its legacy purposes without admitting modern summary purposes", () => {
    const legacy = frozenLegacyReaderSummaryRecoveryContract;
    expect(readerSummaryAttestedPurposeMatches(
      "summary", "primary", legacy.purposes.generate, legacy,
    )).toBe(true);
    expect(readerSummaryAttestedPurposeMatches(
      "summary", "repair", legacy.purposes.repair, legacy,
    )).toBe(true);
    expect(readerSummaryAttestedPurposeMatches(
      "summary", "primary", activeReaderSummaryPurposes.generate, legacy,
    )).toBe(false);
    expect(readerSummaryAttestedPurposeMatches(
      "summary", "primary", legacy.purposes.generate,
    )).toBe(false);
  });

  it("preserves the existing purpose binding for non-summary roles irrespective of attempt label", () => {
    expect(readerSummaryAttestedPurposeMatches(
      "topic_label", "attempt-2", activeReaderSummaryPurposes.topicLabel,
    )).toBe(true);
  });
});
