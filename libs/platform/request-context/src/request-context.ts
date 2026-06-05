export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const CAUSATION_ID_HEADER = 'x-causation-id';

export type RequestContext = {
  readonly requestId: string;
  readonly correlationId: string;
  readonly causationId?: string;
};

export const buildRequestContext = (headers: {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}): RequestContext => {
  const requestId = normalize(headers.requestId) ?? crypto.randomUUID();
  const correlationId = normalize(headers.correlationId) ?? requestId;
  const causationId = normalize(headers.causationId);

  return causationId ? { requestId, correlationId, causationId } : { requestId, correlationId };
};

const normalize = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
};
