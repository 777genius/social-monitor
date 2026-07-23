import type {
  DomainError,
  Result,
  TenantId,
  WorkspaceId,
} from '@social-monitor/shared-kernel';

import type { SourceTargetDescriptor } from './source-target-catalog.port';

export type InterestSourceScanPolicyRequest = {
  readonly intervalSeconds?: number;
  readonly freshnessSeconds?: number;
  readonly retryBudget?: number;
};

export type ProvisionInterestSourceCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly descriptor: SourceTargetDescriptor;
  readonly scanPolicy?: InterestSourceScanPolicyRequest;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};

export type ProvisionInterestSourceResult = {
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly activation: {
    readonly interestCreated: boolean;
    readonly sourceBindingCreated: boolean;
    readonly scanPolicyCreated: boolean;
    readonly scanPolicyUpdated: boolean;
  };
};

export interface InterestSourceProvisionerPort {
  provision(
    command: ProvisionInterestSourceCommand,
  ): Promise<Result<ProvisionInterestSourceResult, DomainError | Error>>;
}
