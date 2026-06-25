import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ProviderFailureKind,
  SourceCapabilityProfile,
  SourceContentUnit,
  SourceCursorModel,
  SourceProviderKey,
  SourceQueryMode,
  SourceQuotaModel,
} from "../domain";
import type { FetchedSourceItem } from "./source-fetcher.port";
import type { SourceRuntimeConfig } from "./source-config-reader.port";

export type ProviderKey = SourceProviderKey;
export type {
  ProviderFailureKind,
  SourceCapabilityProfile,
  SourceContentUnit,
  SourceCursorModel,
  SourceQueryMode,
  SourceQuotaModel,
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
  planScan(
    query: SourceQuery,
    context: SourceProviderScanContext,
  ): SourceProviderScanPlan;
  scan(
    plan: SourceProviderScanPlan,
    context: SourceProviderScanContext,
  ): Promise<SourceProviderScanResult>;
  classifyError(
    error: unknown,
    context: SourceProviderScanContext,
  ): ProviderFailure;
}
