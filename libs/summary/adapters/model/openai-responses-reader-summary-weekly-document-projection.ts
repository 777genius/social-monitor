type LegacyWeeklyRootFields = {
  readonly schemaVersion: unknown;
  readonly sealId: unknown;
  readonly sealSha: unknown;
  readonly weekStartedOn: unknown;
  readonly weekEndedOn: unknown;
  readonly headline: unknown;
  readonly takeaway: unknown;
  readonly synthesis: unknown;
};

/**
 * Shared projection for the three admitted historical weekly envelopes.
 * Callers must validate exact keys, citations, chronology and stories first.
 * The untrusted provider JSON must never reach this projection directly.
 */
export const projectLegacyWeeklyDocument = (
  value: LegacyWeeklyRootFields,
  rootCitationIds: readonly string[],
  stories: readonly unknown[],
  sections: readonly unknown[],
): unknown => ({
  schemaVersion: value.schemaVersion,
  sealId: value.sealId,
  sealSha: value.sealSha,
  weekStartedOn: value.weekStartedOn,
  weekEndedOn: value.weekEndedOn,
  headline: value.headline,
  headlineCitationIds: [...rootCitationIds],
  takeaway: value.takeaway,
  takeawayCitationIds: [...rootCitationIds],
  synthesis: value.synthesis,
  synthesisCitationIds: [...rootCitationIds],
  stories,
  sections,
});
