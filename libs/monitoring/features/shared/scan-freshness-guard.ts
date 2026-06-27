import type { JsonObject } from '@social-monitor/shared-kernel';

import type { ScanJob } from '../../domain';
import { buildScanStatusView } from './scan-status-view';

const maximumTransientProviderBackoffSeconds = 900;
const providerRateLimitResetBufferMs = 30_000;

export const boundedTransientProviderBackoffSeconds = (params: {
  readonly intervalSeconds: number;
}): number =>
  Math.min(
    Math.max(1, params.intervalSeconds),
    maximumTransientProviderBackoffSeconds,
  );

export const isFreshSuccessfulScan = (params: {
  readonly latestJob: ScanJob | null;
  readonly freshnessSeconds: number;
  readonly now: Date;
}): boolean => {
  const latestSnapshot = params.latestJob?.toSnapshot();

  return (
    latestSnapshot?.status === 'succeeded' &&
    latestSnapshot.completedAt !== undefined &&
    latestSnapshot.completedAt.getTime() + params.freshnessSeconds * 1000 >=
      params.now.getTime()
  );
};

export const rateLimitBackoffUntil = (params: {
  readonly latestJob: ScanJob | null;
  readonly backoffSeconds: number;
  readonly now: Date;
}): Date | null => {
  const latestSnapshot = params.latestJob?.toSnapshot();

  if (
    latestSnapshot?.status !== 'failed' ||
    latestSnapshot.completedAt === undefined ||
    buildScanStatusView({
      status: latestSnapshot.status,
      failureReason: latestSnapshot.failureReason,
      failureMetadata: latestSnapshot.failureMetadata,
    }).failureClass !== 'provider_rate_limited'
  ) {
    return null;
  }

  const providerBackoffUntil = providerRateLimitBackoffUntil({
    failureReason: latestSnapshot.failureReason,
    failureMetadata: latestSnapshot.failureMetadata,
    completedAt: latestSnapshot.completedAt,
    now: params.now,
  });
  if (providerBackoffUntil !== null) {
    return providerBackoffUntil;
  }

  const backoffUntil = new Date(
    latestSnapshot.completedAt.getTime() + params.backoffSeconds * 1000,
  );

  return backoffUntil.getTime() > params.now.getTime() ? backoffUntil : null;
};

export const providerFailureBackoffUntil = (params: {
  readonly recentJobs: readonly ScanJob[];
  readonly backoffSeconds: number;
  readonly now: Date;
  readonly failureThreshold?: number;
  readonly maxBackoffMultiplier?: number;
}): Date | null => {
  const failureThreshold = params.failureThreshold ?? 2;
  const maxBackoffMultiplier = params.maxBackoffMultiplier ?? 4;
  let consecutiveProviderFailures = 0;
  let latestProviderFailureCompletedAt: Date | undefined;

  for (const job of params.recentJobs) {
    const snapshot = job.toSnapshot();

    if (snapshot.status === 'requested' || snapshot.status === 'enqueued') {
      continue;
    }

    if (snapshot.status !== 'failed' || snapshot.completedAt === undefined) {
      break;
    }

    const view = buildScanStatusView({
      status: snapshot.status,
      failureReason: snapshot.failureReason,
      failureMetadata: snapshot.failureMetadata,
    });
    if (view.failureClass !== 'provider_unavailable') {
      break;
    }

    latestProviderFailureCompletedAt ??= snapshot.completedAt;
    consecutiveProviderFailures += 1;
  }

  if (
    consecutiveProviderFailures < failureThreshold ||
    latestProviderFailureCompletedAt === undefined
  ) {
    return null;
  }

  const multiplier = Math.min(
    consecutiveProviderFailures,
    maxBackoffMultiplier,
  );
  const backoffUntil = new Date(
    latestProviderFailureCompletedAt.getTime() +
      params.backoffSeconds * multiplier * 1000,
  );

  return backoffUntil.getTime() > params.now.getTime() ? backoffUntil : null;
};

const providerRateLimitBackoffUntil = (params: {
  readonly failureReason?: string;
  readonly failureMetadata?: JsonObject;
  readonly completedAt: Date;
  readonly now: Date;
}): Date | null => {
  const resetAt =
    readMetadataDate(params.failureMetadata, 'rateLimitResetAt') ??
    parseFailureReasonDate(
      params.failureReason,
      'rateLimitResetAt',
    );
  if (resetAt !== null && resetAt.getTime() > params.now.getTime()) {
    return new Date(resetAt.getTime() + providerRateLimitResetBufferMs);
  }

  const retryAfterMs =
    readMetadataPositiveInteger(params.failureMetadata, 'retryAfterMs') ??
    parseFailureReasonPositiveInteger(
      params.failureReason,
      'retryAfterMs',
    );
  if (retryAfterMs !== null) {
    const retryAt = new Date(
      params.completedAt.getTime() +
        retryAfterMs +
        providerRateLimitResetBufferMs,
    );

    return retryAt.getTime() > params.now.getTime() ? retryAt : null;
  }

  return null;
};

const readMetadataDate = (
  metadata: JsonObject | undefined,
  key: string,
): Date | null => {
  const value = metadata?.[key];
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const readMetadataPositiveInteger = (
  metadata: JsonObject | undefined,
  key: string,
): number | null => {
  const value = metadata?.[key];

  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
};

const parseFailureReasonDate = (
  failureReason: string | undefined,
  key: string,
): Date | null => {
  const value = parseFailureReasonToken(failureReason, key);
  if (value === null) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseFailureReasonPositiveInteger = (
  failureReason: string | undefined,
  key: string,
): number | null => {
  const value = parseFailureReasonToken(failureReason, key);
  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseFailureReasonToken = (
  failureReason: string | undefined,
  key: string,
): string | null => {
  const match = failureReason?.match(
    new RegExp(`(?:^|\\s)${key}=([^\\s]+)`, 'u'),
  );

  return match?.[1] ?? null;
};
