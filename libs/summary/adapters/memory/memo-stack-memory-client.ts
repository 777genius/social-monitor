import { createHash } from 'node:crypto';

import {
  InfinityContextClient,
  type InfinityContextClientOptions,
  type SourceRef,
} from '@infinity-context/sdk';

export type MemoStackFetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type MemoStackMemoryClientOptions = {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutMs?: number;
  readonly fetchFn?: MemoStackFetchLike;
};

type SdkHttpTransport = NonNullable<InfinityContextClientOptions['transport']>;
type SdkHttpRequest = Parameters<SdkHttpTransport['send']>[0];

export const defaultMemoStackTimeoutMs = 30_000;
const maxWorkflowIdempotencyKeyLength = 115;
const maxSourceIdLength = 160;

export const createMemoStackMemoryClient = (options: MemoStackMemoryClientOptions): InfinityContextClient =>
  new InfinityContextClient({
    baseUrl: normalizeMemoStackBaseUrl(options.baseUrl),
    token: options.token.trim(),
    timeoutMs: positiveIntegerOrFallback(options.timeoutMs, defaultMemoStackTimeoutMs),
    transport: transportFromFetch(options.fetchFn ?? fetch, normalizeMemoStackBaseUrl(options.baseUrl)),
  });

export const memoStackWorkflowIdempotencyKey = (...parts: readonly string[]): string => {
  const raw = parts.join(':');

  return raw.length <= maxWorkflowIdempotencyKeyLength
    ? raw
    : stableBoundedMemoStackText(raw, maxWorkflowIdempotencyKeyLength);
};

export const memoStackSourceRef = (sourceType: string, sourceId: string | undefined): SourceRef | undefined =>
  sourceId === undefined || sourceId.trim().length === 0
    ? undefined
    : {
        source_type: sourceType,
        source_id: stableBoundedMemoStackText(sourceId.trim(), maxSourceIdLength),
      };

export const normalizeMemoStackBaseUrl = (value: string): string => value.trim().replace(/\/+$/u, '');

export const positiveIntegerOrFallback = (value: number | undefined, fallback: number): number =>
  value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;

export const parsePositiveInteger = (value: string | undefined): number | undefined => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const stableBoundedMemoStackText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  const digest = createHash('sha256').update(value).digest('hex').slice(0, 32);
  const prefix = value.slice(0, maxLength - digest.length - 1).replace(/:+$/, '');

  return `${prefix}:${digest}`;
};

const transportFromFetch = (fetchFn: MemoStackFetchLike, baseUrl: string): SdkHttpTransport => {
  const basePathPrefix = baseUrlPathPrefix(baseUrl);

  return {
    async send(request: SdkHttpRequest) {
      const url = applyBasePathPrefix(request.url, basePathPrefix);
      const headers = new Headers(request.headers);
      const body = requestBody(request, headers);
      const init: RequestInit = { method: request.method, headers };
      if (body !== undefined) init.body = body;
      if (request.signal !== undefined) init.signal = request.signal;

      const response = await fetchFn(url, init);
      return {
        status: response.status,
        headers: response.headers,
        body: request.responseType === 'bytes'
          ? new Uint8Array(await response.arrayBuffer())
          : await response.text(),
      };
    },
  };
};

const requestBody = (request: SdkHttpRequest, headers: Headers): BodyInit | undefined => {
  if (request.body?.kind === 'json') {
    headers.set('content-type', headers.get('content-type') ?? 'application/json');

    return JSON.stringify(request.body.value);
  }
  if (request.body?.kind !== 'bytes') {
    return undefined;
  }
  if (request.body.contentType !== undefined) {
    headers.set('content-type', request.body.contentType);
  }

  return request.body.value;
};

const baseUrlPathPrefix = (baseUrl: string): string => {
  const pathname = new URL(baseUrl).pathname.replace(/\/+$/u, '');

  return pathname === '/' ? '' : pathname;
};

const applyBasePathPrefix = (url: URL, basePathPrefix: string): URL => {
  if (basePathPrefix.length === 0 || url.pathname.startsWith(`${basePathPrefix}/`)) {
    return url;
  }

  const prefixed = new URL(url.toString());
  prefixed.pathname = `${basePathPrefix}${url.pathname}`;
  return prefixed;
};
