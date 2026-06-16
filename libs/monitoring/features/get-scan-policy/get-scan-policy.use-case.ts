import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { ScanPolicyRepositoryPort, SourceBindingRepositoryPort } from '../../ports';
import { presentScanPolicy } from '../shared/scan-policy-presenter';
import type { GetScanPolicyQuery } from './get-scan-policy.query';
import type { GetScanPolicyResult } from './get-scan-policy.result';

type GetScanPolicyFailure = DomainError;

export class GetScanPolicyUseCase {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly scanPolicies: ScanPolicyRepositoryPort,
  ) {}

  async execute(query: GetScanPolicyQuery): Promise<Result<GetScanPolicyResult, GetScanPolicyFailure>> {
    if (query.sourceBindingId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Source binding id is required'));
    }

    const binding = await this.sourceBindings.findById({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      sourceBindingId: query.sourceBindingId,
    });
    if (binding === null) {
      return err(new DomainError('resource.not_found', 'Source binding not found', {
        sourceBindingId: query.sourceBindingId,
      }));
    }

    const policy = await this.scanPolicies.findBySourceBinding({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      sourceBindingId: query.sourceBindingId,
    });
    if (policy === null) {
      return err(new DomainError('resource.not_found', 'Scan policy not found', {
        sourceBindingId: query.sourceBindingId,
      }));
    }

    return ok(presentScanPolicy(policy));
  }
}
