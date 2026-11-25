import type { JsonObject } from '@social-monitor/shared-kernel';

import type { ScanStatusFailureClass } from '../shared/scan-status-view';
import type {
  SourceBindingHealthFreshnessView,
  SourceBindingHealthRecentWindowView,
  SourceBindingHealthSchedulerDecisionView,
  SourceBindingHealthState,
} from './get-source-binding-health.result';

export type SourceBindingHealthExplanationReasonCode =
  | 'source_healthy'
  | 'source_stale'
  | 'source_rate_limited'
  | 'source_auth_failed'
  | 'source_degraded'
  | 'source_unsupported_scope'
  | 'source_paused'
  | 'source_not_configured'
  | 'source_scheduled'
  | 'source_scanning'
  | 'source_down';

export type SourceBindingHealthExplanationView = {
  readonly reasonCode: SourceBindingHealthExplanationReasonCode;
  readonly message: string;
  readonly operatorAction: string;
  readonly unavailableUntil?: string;
  readonly staleBySeconds?: number;
  readonly signals: readonly string[];
};

export type SourceFailureKind =
  | 'rate_limited'
  | 'auth_failed'
  | 'unsupported_scope'
  | 'provider_unavailable'
  | 'worker_conflict'
  | 'system_failure'
  | 'unknown';

export const buildSourceBindingHealthExplanation = (params: {
  readonly providerKey: string;
  readonly healthState: SourceBindingHealthState;
  readonly operatorAction: string;
  readonly schedulerDecision: SourceBindingHealthSchedulerDecisionView;
  readonly freshness?: SourceBindingHealthFreshnessView;
  readonly latestFailureClass?: ScanStatusFailureClass;
  readonly latestFailureReason?: string;
  readonly recentWindow?: SourceBindingHealthRecentWindowView;
}): SourceBindingHealthExplanationView => {
  const providerName = sourceProviderDisplayName(params.providerKey);
  const signals = sourceHealthExplanationSignals(params);

  switch (params.healthState) {
    case 'healthy':
      return {
        reasonCode: 'source_healthy',
        message: `${providerName} source healthy.`,
        operatorAction: params.operatorAction,
        signals,
      };
    case 'stale':
      return {
        reasonCode: 'source_stale',
        message: `${providerName} source stale ${formatDuration(params.freshness?.staleBySeconds ?? params.freshness?.ageSeconds ?? 0)}.`,
        operatorAction: params.operatorAction,
        staleBySeconds: params.freshness?.staleBySeconds,
        signals,
      };
    case 'rate_limited': {
      const unavailableUntil =
        params.schedulerDecision.rateLimitBackoffUntil ??
        params.schedulerDecision.nextEligibleAt;

      return {
        reasonCode: 'source_rate_limited',
        message: unavailableUntil === undefined
          ? `${providerName} rate limited.`
          : `${providerName} rate limited until ${formatTimeUtc(unavailableUntil)}.`,
        operatorAction: params.operatorAction,
        unavailableUntil,
        signals,
      };
    }
    case 'auth_failed':
      return {
        reasonCode: 'source_auth_failed',
        message: `${providerName} auth failed. Reconnect credentials.`,
        operatorAction: params.operatorAction,
        unavailableUntil: params.schedulerDecision.providerFailureBackoffUntil,
        signals,
      };
    case 'unsupported_scope':
      return {
        reasonCode: 'source_unsupported_scope',
        message: `${providerName} source scope unsupported. Adjust query or requested scopes.`,
        operatorAction: params.operatorAction,
        signals,
      };
    case 'degraded':
      return {
        reasonCode: 'source_degraded',
        message: `${providerName} source degraded. Check latest scan failure.`,
        operatorAction: params.operatorAction,
        unavailableUntil: params.schedulerDecision.providerFailureBackoffUntil,
        signals,
      };
    case 'down':
      return {
        reasonCode: 'source_down',
        message: `${providerName} source down. Pause or back off until recovery.`,
        operatorAction: params.operatorAction,
        unavailableUntil: params.schedulerDecision.providerFailureBackoffUntil,
        signals,
      };
    case 'paused':
      return {
        reasonCode: 'source_paused',
        message: `${providerName} source paused.`,
        operatorAction: params.operatorAction,
        signals,
      };
    case 'not_configured':
      return {
        reasonCode: 'source_not_configured',
        message: `${providerName} source missing scan policy.`,
        operatorAction: params.operatorAction,
        signals,
      };
    case 'scheduled':
      return {
        reasonCode: 'source_scheduled',
        message: `${providerName} source scheduled.`,
        operatorAction: params.operatorAction,
        unavailableUntil: params.schedulerDecision.nextEligibleAt,
        signals,
      };
    case 'scanning':
      return {
        reasonCode: 'source_scanning',
        message: `${providerName} source scan in progress.`,
        operatorAction: params.operatorAction,
        signals,
      };
  }
};

export const classifySourceFailureKind = (params: {
  readonly failureClass?: ScanStatusFailureClass;
  readonly failureReason?: string;
  readonly failureMetadata?: JsonObject;
}): SourceFailureKind => {
  const metadataKind = readMetadataString(params.failureMetadata, 'kind');
  if (metadataKind === 'rate_limited') {
    return 'rate_limited';
  }
  if (metadataKind === 'auth_failed') {
    return 'auth_failed';
  }
  if (metadataKind === 'invalid_query') {
    return 'unsupported_scope';
  }

  if (params.failureClass === 'provider_rate_limited') {
    return 'rate_limited';
  }
  if (params.failureClass === 'provider_auth_failed') {
    return 'auth_failed';
  }
  if (params.failureClass === 'provider_unavailable') {
    return 'provider_unavailable';
  }
  if (params.failureClass === 'worker_conflict') {
    return 'worker_conflict';
  }
  if (params.failureClass === 'system_failure') {
    return 'system_failure';
  }

  const normalized = params.failureReason?.toLowerCase() ?? '';
  if (
    normalized.includes('rate limit') ||
    normalized.includes('rate_limited') ||
    normalized.includes('429')
  ) {
    return 'rate_limited';
  }
  if (
    normalized.includes('unsupported_scope') ||
    normalized.includes('unsupported scope') ||
    normalized.includes('insufficient_scope') ||
    normalized.includes('insufficient scope') ||
    normalized.includes('invalid_query') ||
    normalized.includes('scope missing')
  ) {
    return 'unsupported_scope';
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
    return 'auth_failed';
  }
  if (normalized.includes('provider') || normalized.includes('unavailable')) {
    return 'provider_unavailable';
  }
  if (normalized.includes('lease') || normalized.includes('already')) {
    return 'worker_conflict';
  }

  return normalized.length === 0 ? 'unknown' : 'system_failure';
};

const sourceHealthExplanationSignals = (params: {
  readonly healthState: SourceBindingHealthState;
  readonly schedulerDecision: SourceBindingHealthSchedulerDecisionView;
  readonly recentWindow?: SourceBindingHealthRecentWindowView;
}): readonly string[] =>
  Array.from(new Set([
    params.healthState,
    ...params.schedulerDecision.signals,
    ...(params.recentWindow?.signals ?? []),
  ])).sort();

const sourceProviderDisplayName = (providerKey: string): string => {
  switch (providerKey.trim().toLowerCase()) {
    case 'github':
    case 'github-issues':
      return 'GitHub';
    case 'github-repo-radar':
      return 'GitHub Repo Radar';
    case 'github-trending-page':
      return 'GitHub Trending';
    case 'hacker-news':
    case 'hn':
      return 'HN';
    case 'reddit':
      return 'Reddit';
    case 'rss':
      return 'RSS';
    case 'x-twitter':
      return 'X/Twitter';
    default:
      return providerKey.trim() || 'Source';
  }
};

const formatTimeUtc = (isoDate: string): string => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }

  return `${parsed.toISOString().slice(11, 16)} UTC`;
};

const formatDuration = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safeSeconds / 86_400);
  if (days >= 1) {
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }

  const hours = Math.floor(safeSeconds / 3_600);
  if (hours >= 1) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  if (minutes >= 1) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  return `${safeSeconds} ${safeSeconds === 1 ? 'second' : 'seconds'}`;
};

const readMetadataString = (
  metadata: JsonObject | undefined,
  key: string,
): string | undefined => {
  const value = metadata?.[key];

  return typeof value === 'string' ? value : undefined;
};
