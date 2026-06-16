import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { FetchedSourceItem } from './source-fetcher.port';
import type { SourceRuntimeConfig } from './source-config-reader.port';

export type ProviderKey = string;

export type SourceContentUnit = 'post' | 'comment' | 'profile' | 'community' | 'media' | 'link';
export type SourceQueryMode = 'search' | 'listing' | 'account_feed' | 'thread' | 'url';
export type SourceCursorModel = 'none' | 'time' | 'page_token' | 'opaque' | 'since_id' | 'etag_last_modified';
export type SourceQuotaModel = 'none' | 'per_app' | 'per_credential' | 'per_tenant' | 'per_source_binding';
export type ProviderFailureKind = 'rate_limited' | 'auth_failed' | 'unavailable' | 'invalid_query' | 'unknown';

export type SourceCapabilityProfile = {
  readonly providerKey: ProviderKey;
  readonly displayName: string;
  readonly version: number;
  readonly productionSafe: boolean;
  readonly supportedContentUnits: readonly SourceContentUnit[];
  readonly supportedQueryModes: readonly SourceQueryMode[];
  readonly cursorModel: SourceCursorModel;
  readonly stableIdentity: readonly string[];
  readonly quotaModel: SourceQuotaModel;
  readonly limitations: readonly string[];
};

export type SourceQuery = {
  readonly mode: SourceQueryMode;
  readonly query: string;
};

export type SourceProviderScanContext = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly scanJobId: string;
  readonly correlationId: string;
  readonly config?: SourceRuntimeConfig;
};

export type SourceProviderScanPlan = {
  readonly query: SourceQuery;
  readonly maxItems: number;
  readonly cursor?: string;
};

export type SourceProviderScanResult = {
  readonly items: readonly FetchedSourceItem[];
  readonly nextCursor?: string;
  readonly warnings: readonly string[];
};

export type SourceProviderValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export type ProviderFailure = {
  readonly kind: ProviderFailureKind;
  readonly retryable: boolean;
  readonly message: string;
};

export interface SourceProviderPort {
  key(): ProviderKey;
  capabilityProfile(): SourceCapabilityProfile;
  validateBinding(query: SourceQuery): SourceProviderValidationResult;
  planScan(query: SourceQuery, context: SourceProviderScanContext): SourceProviderScanPlan;
  scan(plan: SourceProviderScanPlan, context: SourceProviderScanContext): Promise<SourceProviderScanResult>;
  classifyError(error: unknown, context: SourceProviderScanContext): ProviderFailure;
}
