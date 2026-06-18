import { CryptoIdGenerator, type IdGenerator } from '@social-monitor/shared-kernel';

export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const CAUSATION_ID_HEADER = 'x-causation-id';

export type RequestContext = {
  readonly requestId: string;
  readonly correlationId: string;
  readonly causationId?: string;
};

const MAX_CONTEXT_ID_LENGTH = 128;
const contextIdPattern = /^[A-Za-z0-9._:-]+$/;
const defaultRequestContextIdGenerator = new CryptoIdGenerator();

export const buildRequestContext = (headers: {
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}, idGenerator: IdGenerator = defaultRequestContextIdGenerator): RequestContext => {
  const requestId = normalizeRequestContextId(headers.requestId) ?? idGenerator.generate();
  const correlationId = normalizeRequestContextId(headers.correlationId) ?? requestId;
  const causationId = normalizeRequestContextId(headers.causationId);

  return causationId ? { requestId, correlationId, causationId } : { requestId, correlationId };
};

export const normalizeRequestContextId = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  if (!normalized || normalized.length === 0 || normalized.length > MAX_CONTEXT_ID_LENGTH) {
    return undefined;
  }

  return contextIdPattern.test(normalized) ? normalized : undefined;
};
