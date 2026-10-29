/** Immutable assessment identity; no provider transport or credential details. */
export type ReaderValueScoringConfiguration = {
  readonly rubricVersion: string;
  readonly rubricSha256: string;
  readonly inputBuilderVersion: string;
  readonly modelConfigVersion: string;
  readonly requestedModel: string;
};
