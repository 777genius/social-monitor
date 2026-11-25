export type ReaderSummaryMultiDayGenerationProfile = {
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly rankingPolicyVersion: string;
};

type ActualGenerationProfile = ReaderSummaryMultiDayGenerationProfile;

export const matchesReaderSummaryMultiDayGenerationProfile = (
  actual: ActualGenerationProfile,
  expected: ReaderSummaryMultiDayGenerationProfile,
): boolean =>
  actual.modelVersion === expected.modelVersion &&
  actual.promptVersion === expected.promptVersion &&
  actual.rankingPolicyVersion === expected.rankingPolicyVersion;

export const readerSummaryMultiDayGenerationProfileMismatch = (
  actual: ActualGenerationProfile,
): string =>
  `Generation profile mismatch: model=${actual.modelVersion} prompt=${actual.promptVersion} ranking=${actual.rankingPolicyVersion}`;
