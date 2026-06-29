import {
  DomainError,
  err,
  ok,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import type { SourceTargetCatalogPort } from '../../ports';
import type { ActivateInterestSourceCommand } from './activate-interest-source.command';
import { ActivateInterestSourceUseCase } from './activate-interest-source.use-case';

describe('ActivateInterestSourceUseCase', () => {
  it('activates legacy X target input as canonical x-twitter daily source', async () => {
    const workflows = recordingWorkflows();
    const useCase = new ActivateInterestSourceUseCase(
      workflows.createSubscription,
      workflows.createInterest,
      workflows.bindSource,
      workflows.setScanPolicy,
      new FakeXTargetCatalog(),
    );

    const result = await useCase.execute(command({
      providerKey: 'x-twitter-experimental-daily',
      targetKind: 'search_query',
      targetValue: 'OpenAI Agents',
      targetConfig: {
        language: 'en',
        maxItems: 40,
      },
      schedule: {
        recipientKey: 'user-1',
        channel: 'in_app',
        intervalSeconds: 3_600,
        includeNoSignal: true,
      },
    }));

    expect(result.ok).toBe(true);
    expect(workflows.createInterest.commands).toEqual([
      expect.objectContaining({
        name: 'openai agents',
        query: 'openai agents',
      }),
    ]);
    expect(workflows.bindSource.commands).toEqual([
      expect.objectContaining({
        providerKey: 'x-twitter',
        config: expect.objectContaining({
          mode: 'search',
          query: 'openai agents',
          language: 'en',
          windowHours: 24,
          searchProducts: ['top', 'latest'],
          maxItems: 40,
          limitPerProduct: 50,
          minLikes: 1,
          minRetweets: 0,
          minReplies: 0,
        }),
      }),
    ]);
    expect(workflows.setScanPolicy.commands).toEqual([
      expect.objectContaining({
        intervalSeconds: 86_400,
        freshnessSeconds: 86_400,
        retryBudget: 3,
      }),
    ]);
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

  it('maps X account targets to search queries without leaking account_feed mode', async () => {
    const workflows = recordingWorkflows();
    const useCase = new ActivateInterestSourceUseCase(
      workflows.createSubscription,
      workflows.createInterest,
      workflows.bindSource,
      workflows.setScanPolicy,
      new FakeXTargetCatalog(),
    );

    const result = await useCase.execute(command({
      targetKind: 'account',
      targetValue: '@OpenAI',
    }));

    expect(result.ok).toBe(true);
    expect(workflows.createInterest.commands[0]).toEqual(expect.objectContaining({
      name: '@openai',
      query: 'from:openai',
    }));
    expect(workflows.bindSource.commands[0]).toEqual(expect.objectContaining({
      providerKey: 'x-twitter',
      config: expect.objectContaining({
        mode: 'search',
        query: 'from:openai',
      }),
    }));
  });

  it('uses provider default scan cadence when activation has no explicit scan policy', async () => {
    const workflows = recordingWorkflows();
    const useCase = new ActivateInterestSourceUseCase(
      workflows.createSubscription,
      workflows.createInterest,
      workflows.bindSource,
      workflows.setScanPolicy,
      new FakeProviderTargetCatalog(),
    );

    const result = await useCase.execute(command({
      providerKey: 'reddit',
      targetKind: 'subreddit',
      targetValue: 'OpenAI',
      schedule: {
        recipientKey: 'user-1',
        channel: 'in_app',
        intervalSeconds: 86_400,
        includeNoSignal: true,
      },
    }));

    expect(result.ok).toBe(true);
    expect(workflows.setScanPolicy.commands).toEqual([
      expect.objectContaining({
        intervalSeconds: 1_800,
        freshnessSeconds: 1_800,
        retryBudget: 3,
      }),
    ]);
  });

  it('clamps explicit activation scan policy to the provider minimum interval', async () => {
    const workflows = recordingWorkflows();
    const useCase = new ActivateInterestSourceUseCase(
      workflows.createSubscription,
      workflows.createInterest,
      workflows.bindSource,
      workflows.setScanPolicy,
      new FakeProviderTargetCatalog(),
    );

    const result = await useCase.execute(command({
      providerKey: 'github-trending-page',
      targetKind: 'search_query',
      targetValue: 'ai agents',
      scanPolicy: {
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 1,
      },
    }));

    expect(result.ok).toBe(true);
    expect(workflows.setScanPolicy.commands).toEqual([
      expect.objectContaining({
        intervalSeconds: 3_600,
        freshnessSeconds: 3_600,
        retryBudget: 1,
      }),
    ]);
  });

  it('rejects unsupported targets before creating downstream resources', async () => {
    const workflows = recordingWorkflows();
    const useCase = new ActivateInterestSourceUseCase(
      workflows.createSubscription,
      workflows.createInterest,
      workflows.bindSource,
      workflows.setScanPolicy,
      new FakeXTargetCatalog(),
    );

    const result = await useCase.execute(command({
      providerKey: 'x-twitter',
      targetKind: 'url',
      targetValue: 'https://x.com/openai',
    }));

    expect(result.ok).toBe(false);
    expect(workflows.createSubscription.commands).toEqual([]);
    expect(workflows.createInterest.commands).toEqual([]);
    expect(workflows.bindSource.commands).toEqual([]);
    expect(workflows.setScanPolicy.commands).toEqual([]);
  });

  it('does not create the user subscription when monitoring binding fails', async () => {
    const workflows = recordingWorkflows();
    const bindSource = {
      commands: [] as unknown[],
      async execute(command: unknown) {
        this.commands.push(command);

        return err(new DomainError('validation.failed', 'Binding failed'));
      },
    };
    const useCase = new ActivateInterestSourceUseCase(
      workflows.createSubscription,
      workflows.createInterest,
      bindSource,
      workflows.setScanPolicy,
      new FakeXTargetCatalog(),
    );

    const result = await useCase.execute(command());

    expect(result.ok).toBe(false);
    expect(workflows.createInterest.commands).toHaveLength(1);
    expect(bindSource.commands).toHaveLength(1);
    expect(workflows.setScanPolicy.commands).toEqual([]);
    expect(workflows.createSubscription.commands).toEqual([]);
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

const recordingWorkflows = () => ({
  createSubscription: {
    commands: [] as unknown[],
    async execute(command: unknown) {
      this.commands.push(command);

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
  createInterest: {
    commands: [] as unknown[],
    async execute(command: unknown) {
      this.commands.push(command);

      return ok({ interestId: 'interest-1', created: true });
    },
  },
  bindSource: {
    commands: [] as unknown[],
    async execute(command: unknown) {
      this.commands.push(command);

      return ok({ sourceBindingId: 'binding-1', created: true });
    },
  },
  setScanPolicy: {
    commands: [] as unknown[],
    async execute(command: unknown) {
      this.commands.push(command);

      return ok({
        scanPolicyId: 'policy-1',
        created: true,
        updated: false,
      });
    },
  },
});

class FakeXTargetCatalog implements SourceTargetCatalogPort {
  validateTarget(params: Parameters<SourceTargetCatalogPort['validateTarget']>[0]) {
    if (params.targetKind === 'url') {
      return { ok: false as const, reason: 'Unsupported x-twitter target kind: url' };
    }

    const targetKind = params.targetKind as 'search_query' | 'account';
    const targetValue = targetKind === 'account'
      ? params.targetValue.replace(/^@/u, '').trim().toLowerCase()
      : params.targetValue.trim().replace(/\s+/gu, ' ').toLowerCase();

    return {
      ok: true as const,
      descriptor: {
        providerKey: 'x-twitter',
        targetKind,
        targetValue,
        normalizedKey: `x-twitter:${targetKind}:${targetValue}`,
        config: params.config,
      },
    };
  }
}

class FakeProviderTargetCatalog implements SourceTargetCatalogPort {
  validateTarget(params: Parameters<SourceTargetCatalogPort['validateTarget']>[0]) {
    return {
      ok: true as const,
      descriptor: {
        providerKey: params.providerKey,
        targetKind: params.targetKind as 'search_query' | 'account' | 'subreddit',
        targetValue: params.targetValue.trim().replace(/\s+/gu, ' ').toLowerCase(),
        normalizedKey: `${params.providerKey}:${params.targetKind}:${params.targetValue.trim().toLowerCase()}`,
        config: params.config,
      },
    };
  }
}
