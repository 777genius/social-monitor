import type { JsonObject } from '@social-monitor/shared-kernel';

export type ScanFailureClass =
  | 'provider_unavailable'
  | 'provider_auth_failed'
  | 'provider_rate_limited'
  | 'worker_conflict'
  | 'system_failure';

export const classifyScanFailure = (
  failureReason: string | undefined,
  failureMetadata: JsonObject | undefined,
): ScanFailureClass => {
  const failureKind = readMetadataString(failureMetadata, 'kind');
  if (failureKind === 'rate_limited') {
    return 'provider_rate_limited';
  }
  if (failureKind === 'auth_failed') {
    return 'provider_auth_failed';
  }
  if (failureKind === 'unavailable' || failureKind === 'invalid_query') {
    return 'provider_unavailable';
  }

  const normalized = failureReason?.toLowerCase() ?? '';

  if (
    normalized.includes('rate limit') ||
    normalized.includes('rate_limited') ||
    normalized.includes('429')
  ) {
    return 'provider_rate_limited';
  }

  if (
    normalized.includes('auth_failed') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden') ||
    normalized.includes('credential') ||
    normalized.includes('invalid_token') ||
    normalized.includes('token expired') ||
    normalized.includes('401') ||
    normalized.includes('403')
  ) {
    return 'provider_auth_failed';
  }

  if (
    normalized.includes('provider') ||
    normalized.includes('unavailable')
  ) {
    return 'provider_unavailable';
  }

  if (normalized.includes('lease') || normalized.includes('already')) {
    return 'worker_conflict';
  }

  return 'system_failure';
};

const readMetadataString = (
  metadata: JsonObject | undefined,
  key: string,
): string | undefined => {
  const value = metadata?.[key];

  return typeof value === 'string' ? value : undefined;
};

