import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { SummaryPolicy } from '../../domain';
import type { SummaryPolicyRepositoryPort } from '../../ports';
import { UpsertSummaryPolicyUseCase } from './upsert-summary-policy.use-case';

class SingleIdGenerator implements IdGenerator {
  generate(): string {
    return 'summary-policy-1';
  }
}

class FakeSummaryPolicies implements SummaryPolicyRepositoryPort {
  private readonly policies = new Map<string, SummaryPolicy>();

  async save(policy: SummaryPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();
    this.policies.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.interestId}`, policy);
  }

  async findByInterest(params: Parameters<SummaryPolicyRepositoryPort['findByInterest']>[0]): Promise<SummaryPolicy | null> {
    return this.policies.get(`${params.tenantId}:${params.workspaceId}:${params.interestId}`) ?? null;
  }
}

const command = {
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  interestId: 'interest-1',
  language: 'ru',
  format: 'bullet_digest',
  tone: 'analytical',
  maxKeyPoints: 7,
  includeRisks: true,
  includeSourceHighlights: false,
  customInstructions: 'Track pricing and launch signals.',
  correlationId: 'correlation-1',
} as const;

describe('UpsertSummaryPolicyUseCase', () => {
  it('creates and then updates an interest summary policy', async () => {
    const useCase = new UpsertSummaryPolicyUseCase(
      new FakeSummaryPolicies(),
      new SingleIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );

    const created = await useCase.execute(command);
    expect(created).toEqual({
      ok: true,
      value: {
        created: true,
        policy: expect.objectContaining({
          summaryPolicyId: 'summary-policy-1',
          interestId: 'interest-1',
          language: 'ru',
          format: 'bullet_digest',
          tone: 'analytical',
          maxKeyPoints: 7,
          includeSourceHighlights: false,
        }),
      },
    });

    const updated = await useCase.execute({
      ...command,
      maxKeyPoints: 3,
      customInstructions: '',
    });
    expect(updated).toEqual({
      ok: true,
      value: {
        created: false,
        policy: expect.objectContaining({
          maxKeyPoints: 3,
          customInstructions: undefined,
        }),
      },
    });
  });
});
