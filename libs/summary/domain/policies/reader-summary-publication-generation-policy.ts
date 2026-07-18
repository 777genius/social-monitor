import { canReaderSummaryModelSupersede } from "./reader-summary-model-authority-policy";

export const canReaderSummaryGenerationSupersede = (params: {
  readonly incomingModelVersion: string;
  readonly visibleModelVersion: string;
  readonly incomingRequestedAt?: Date;
  readonly visibleRequestedAt?: Date;
}): boolean => {
  const incomingRequestedAt = params.incomingRequestedAt?.getTime();
  const visibleRequestedAt = params.visibleRequestedAt?.getTime();
  if (
    incomingRequestedAt === undefined ||
    visibleRequestedAt === undefined ||
    !Number.isFinite(incomingRequestedAt) ||
    !Number.isFinite(visibleRequestedAt) ||
    incomingRequestedAt <= visibleRequestedAt
  ) {
    return false;
  }

  return canReaderSummaryModelSupersede(
    params.incomingModelVersion,
    params.visibleModelVersion,
  );
};
