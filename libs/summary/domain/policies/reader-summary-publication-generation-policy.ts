import {
  canReaderSummaryModelSupersede,
  readerSummaryModelAuthority,
} from "./reader-summary-model-authority-policy";

export const canReaderSummaryGenerationSupersede = (params: {
  readonly incomingModelVersion: string;
  readonly visibleModelVersion: string;
  readonly incomingRequestedAt?: Date;
  readonly visibleRequestedAt?: Date;
}): boolean => {
  if (
    !canReaderSummaryModelSupersede(
      params.incomingModelVersion,
      params.visibleModelVersion,
    )
  ) {
    return false;
  }
  if (
    readerSummaryModelAuthority(params.incomingModelVersion) !==
    readerSummaryModelAuthority(params.visibleModelVersion)
  ) {
    return true;
  }
  if (
    params.incomingRequestedAt === undefined ||
    params.visibleRequestedAt === undefined
  ) {
    return true;
  }

  return (
    params.incomingRequestedAt.getTime() >= params.visibleRequestedAt.getTime()
  );
};
