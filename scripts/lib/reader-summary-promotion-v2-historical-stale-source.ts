const MAXIMUM_MODEL_AUTHORITY = 3;

export const isHistoricalPromotionStaleSourcePreserved = (input: {
  readonly sourcePublicationId: string;
  readonly active: null | Readonly<{
    publicationId: string;
    requestedAt: Date | string;
    modelAuthority: number;
  }>;
  readonly job: Readonly<{
    artifactId: string | null;
    failureReason: string | null;
    requestedAt: Date | string;
  }>;
}): boolean => input.active !== null &&
  input.active.publicationId === input.sourcePublicationId &&
  input.job.artifactId === null &&
  input.job.failureReason ===
    "Reader summary publication was rejected as a stale generation" &&
  exactTimestamp(input.job.requestedAt, "job requestedAt") >
    exactTimestamp(input.active.requestedAt, "publication requestedAt") &&
  input.active.modelAuthority === MAXIMUM_MODEL_AUTHORITY;

const exactTimestamp = (value: Date | string, label: string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Historical promotion ${label} is invalid`);
  }
  return date.toISOString();
};
