import {
  DomainError,
  err,
  ok,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import type {
  InterestSourceProvisionerPort,
  ProvisionInterestSourceCommand,
  SourceTargetCatalogPort,
} from '../../ports';
import type { ActivateInterestSourceCommand } from './activate-interest-source.command';
import { ActivateInterestSourceUseCase } from './activate-interest-source.use-case';

describe('ActivateInterestSourceUseCase', () => {
  it('provisions a validated target before creating its user subscription', async () => {
    const dependencies = recordingDependencies();
    const useCase = new ActivateInterestSourceUseCase(
      dependencies.createSubscription,
      dependencies.provisioner,
      new FakeTargetCatalog(),
    );

    const result = await useCase.execute(command({
      providerKey: 'x-twitter-experimental-daily',
      targetKind: 'search_query',
      targetValue: 'OpenAI Agents',
      targetConfig: { language: 'en' },
      scanPolicy: {
        intervalSeconds: 3_600,
        freshnessSeconds: 7_200,
        retryBudget: 2,
      },
    }));

    expect(result.ok).toBe(true);
    expect(dependencies.provisionCommands).toEqual([
      expect.objectContaining({
        descriptor: {
          providerKey: 'x-twitter',
          targetKind: 'search_query',
          targetValue: 'openai agents',
          normalizedKey: 'x-twitter:search_query:openai agents',
          config: { language: 'en' },
        },
        scanPolicy: {
          intervalSeconds: 3_600,
          freshnessSeconds: 7_200,
          retryBudget: 2,
        },
        idempotencyKey: 'activate-1',
        correlationId: 'corr-1',
      }),
    ]);
    expect(dependencies.subscriptionCommands).toHaveLength(1);
    expect(result.ok && result.value).toEqual(expect.objectContaining({
      interestId: 'interest-1',
      sourceBindingId: 'binding-1',
      scanPolicyId: 'policy-1',
      activation: {
        interestCreated: true,
        sourceBindingCreated: true,
        scanPolicyCreated: true,
        scanPolicyUpdated: false,
      },
    }));
  });

  it('rejects unsupported targets before provisioning or subscription writes', async () => {
    const dependencies = recordingDependencies();
    const useCase = new ActivateInterestSourceUseCase(
      dependencies.createSubscription,
      dependencies.provisioner,
      new FakeTargetCatalog(),
    );

    const result = await useCase.execute(command({ targetKind: 'url' }));

    expect(result.ok).toBe(false);
    expect(dependencies.provisionCommands).toEqual([]);
    expect(dependencies.subscriptionCommands).toEqual([]);
  });

  it('does not create a subscription after provisioning failure', async () => {
    const dependencies = recordingDependencies();
    dependencies.provisioner.provision.mockResolvedValue(
      err(new DomainError('validation.failed', 'Binding failed')),
    );
    const useCase = new ActivateInterestSourceUseCase(
      dependencies.createSubscription,
      dependencies.provisioner,
      new FakeTargetCatalog(),
    );

    const result = await useCase.execute(command());

    expect(result.ok).toBe(false);
    expect(dependencies.subscriptionCommands).toEqual([]);
  });
});

const command = (
  overrides: Partial<ActivateInterestSourceCommand> = {},
): ActivateInterestSourceCommand => ({
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  userId: 'user-1',
  providerKey: 'x-twitter',
  targetKind: 'search_query',
  targetValue: 'AI',
  targetConfig: {},
  schedule: {
    recipientKey: 'user-1',
    channel: 'in_app',
    intervalSeconds: 86_400,
    includeNoSignal: true,
  },
  idempotencyKey: 'activate-1',
  correlationId: 'corr-1',
  ...overrides,
});

const recordingDependencies = () => {
  const provisionCommands: ProvisionInterestSourceCommand[] = [];
  const subscriptionCommands: unknown[] = [];
  const provisioner: jest.Mocked<InterestSourceProvisionerPort> = {
    provision: jest.fn(async (provisionCommand) => {
      provisionCommands.push(provisionCommand);
      return ok({
        interestId: 'interest-1',
        sourceBindingId: 'binding-1',
        scanPolicyId: 'policy-1',
        activation: {
          interestCreated: true,
          sourceBindingCreated: true,
          scanPolicyCreated: true,
          scanPolicyUpdated: false,
        },
      });
    }),
  };

  return {
    provisionCommands,
    provisioner,
    subscriptionCommands,
    createSubscription: {
      async execute(subscriptionCommand: unknown) {
        subscriptionCommands.push(subscriptionCommand);
        return ok({
          sourceTarget: {
            id: 'target-1',
            tenantId: tenantId('tenant-1'),
            workspaceId: workspaceId('workspace-1'),
            providerKey: 'x-twitter',
            targetKind: 'search_query' as const,
            targetValue: 'ai',
            normalizedKey: 'x-twitter:search_query:ai',
            config: {},
            createdAt: '2026-06-27T00:00:00.000Z',
            updatedAt: '2026-06-27T00:00:00.000Z',
          },
          subscription: {
            id: 'subscription-1',
            tenantId: tenantId('tenant-1'),
            workspaceId: workspaceId('workspace-1'),
            userId: 'user-1',
            sourceTargetId: 'target-1',
            status: 'enabled' as const,
            createdAt: '2026-06-27T00:00:00.000Z',
            updatedAt: '2026-06-27T00:00:00.000Z',
          },
          created: true,
        });
      },
    },
  };
};

class FakeTargetCatalog implements SourceTargetCatalogPort {
  validateTarget(
    params: Parameters<SourceTargetCatalogPort['validateTarget']>[0],
  ): ReturnType<SourceTargetCatalogPort['validateTarget']> {
    if (params.targetKind === 'url') {
      return { ok: false, reason: 'Unsupported target kind' };
    }

    const targetValue = params.targetValue
      .trim()
      .replace(/\s+/gu, ' ')
      .toLowerCase();
    const providerKey =
      params.providerKey === 'x-twitter-experimental-daily'
        ? 'x-twitter'
        : params.providerKey;

    return {
      ok: true,
      descriptor: {
        providerKey,
        targetKind: params.targetKind as 'search_query',
        targetValue,
        normalizedKey: `${providerKey}:${params.targetKind}:${targetValue}`,
        config: params.config,
      },
    };
  }
}
