const publicationGenerationKey = "publicationGeneration";

export const readerSummaryPublicationGenerationSignals = (
  generationRequestedAt: Date | undefined,
): Readonly<Record<string, unknown>> =>
  generationRequestedAt === undefined
    ? {}
    : {
        [publicationGenerationKey]: {
          requestedAt: generationRequestedAt.toISOString(),
        },
      };

export const readerSummaryPublicationGenerationRequestedAt = (
  qualitySignals: unknown,
): Date | undefined => {
  if (!isRecord(qualitySignals)) {
    return undefined;
  }
  const generation = qualitySignals[publicationGenerationKey];
  if (!isRecord(generation) || typeof generation.requestedAt !== "string") {
    return undefined;
  }
  const value = new Date(generation.requestedAt);

  return Number.isNaN(value.getTime()) ? undefined : value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
