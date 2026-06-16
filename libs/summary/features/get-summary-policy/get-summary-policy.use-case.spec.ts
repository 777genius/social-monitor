import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { SummaryPolicy } from '../../domain';
import type { SummaryPolicyRepositoryPort } from '../../ports';
import { GetSummaryPolicyUseCase } from './get-summary-policy.use-case';

class SingleIdGenerator implements IdGenerator {
  generate(): string {
    return 'summary-policy-default';
  }
}

class EmptySummaryPolicies implements SummaryPolicyRepositoryPort {
  async save(policy: SummaryPolicy): Promise<void> {
    void policy;
  }

  async findByTopic(): Promise<SummaryPolicy | null> {
    return null;
  }
}

describe('GetSummaryPolicyUseCase', () => {
  it('returns default policy when no topic override exists', async () => {
    const useCase = new GetSummaryPolicyUseCase(
      new EmptySummaryPolicies(),
      new SingleIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        source: 'default',
        policy: expect.objectContaining({
          summaryPolicyId: 'summary-policy-default',
          language: 'auto',
          format: 'executive_brief',
          maxKeyPoints: 5,
          rulesVersion: 'summary.rules.policy.v1',
        }),
      },
    });
  });
});
