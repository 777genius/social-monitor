import type { ScanJob } from '../../domain';
import { buildScanStatusView } from './scan-status-view';

export const isFreshSuccessfulScan = (params: {
  readonly latestJob: ScanJob | null;
  readonly freshnessSeconds: number;
  readonly now: Date;
}): boolean => {
  const latestSnapshot = params.latestJob?.toSnapshot();

  return (
    latestSnapshot?.status === 'succeeded' &&
    latestSnapshot.completedAt !== undefined &&
    latestSnapshot.completedAt.getTime() + params.freshnessSeconds * 1000 > params.now.getTime()
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

  const backoffUntil = new Date(latestSnapshot.completedAt.getTime() + params.backoffSeconds * 1000);

  return backoffUntil.getTime() > params.now.getTime() ? backoffUntil : null;
};
