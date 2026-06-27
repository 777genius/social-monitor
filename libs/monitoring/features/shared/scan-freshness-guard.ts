import type { ScanJob } from '../../domain';
import { buildScanStatusView } from './scan-status-view';

const maximumTransientProviderBackoffSeconds = 900;

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
    }).failureClass !== 'provider_rate_limited'
  ) {
    return null;
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
