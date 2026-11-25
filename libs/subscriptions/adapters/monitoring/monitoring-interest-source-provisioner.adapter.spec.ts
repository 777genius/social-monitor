import {
  DomainError,
  err,
  ok,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import type {
  ProvisionInterestSourceCommand,
  SourceTargetDescriptor,
} from '../../ports';
import { MonitoringInterestSourceProvisionerAdapter } from './monitoring-interest-source-provisioner.adapter';

describe('MonitoringInterestSourceProvisionerAdapter', () => {
  it('maps canonical X search targets and daily cadence into monitoring commands', async () => {
    const workflows = recordingWorkflows();
    const adapter = createAdapter(workflows);

    const result = await adapter.provision(command({
      descriptor: descriptor({
        providerKey: 'x-twitter',
        targetValue: 'openai agents',
        config: {
          language: 'en',
          maxItems: 40,
        },
      }),
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
  });

  it('maps X account targets to a search query', async () => {
    const workflows = recordingWorkflows();
    const adapter = createAdapter(workflows);

    const result = await adapter.provision(command({
      descriptor: descriptor({
        targetKind: 'account',
        targetValue: 'openai',
      }),
    }));

    expect(result.ok).toBe(true);
    expect(workflows.createInterest.commands[0]).toEqual(
      expect.objectContaining({
        name: '@openai',
        query: 'from:openai',
      }),
    );
    expect(workflows.bindSource.commands[0]).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({
          mode: 'search',
          query: 'from:openai',
        }),
      }),
    );
  });

  it('uses provider defaults and clamps requested cadence to the provider minimum', async () => {
    const workflows = recordingWorkflows();
    const adapter = createAdapter(workflows);

    await adapter.provision(command({
      descriptor: descriptor({
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'openai',
      }),
    }));
    await adapter.provision(command({
      descriptor: descriptor({
        providerKey: 'github-trending-page',
        targetValue: 'ai agents',
      }),
      scanPolicy: {
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 1,
      },
    }));

    expect(workflows.setScanPolicy.commands).toEqual([
      expect.objectContaining({
        intervalSeconds: 1_800,
        freshnessSeconds: 1_800,
        retryBudget: 3,
      }),
      expect.objectContaining({
        intervalSeconds: 86_400,
        freshnessSeconds: 86_400,
        retryBudget: 1,
      }),
    ]);
  });

  it('stops before scan policy creation when source binding fails', async () => {
    const workflows = recordingWorkflows();
    const failedBindSource = {
      commands: [] as unknown[],
      async execute(bindingCommand: unknown) {
        this.commands.push(bindingCommand);
        return err(new DomainError('validation.failed', 'Binding failed'));
      },
    };
    const adapter = new MonitoringInterestSourceProvisionerAdapter(
      workflows.createInterest,
      failedBindSource,
      workflows.setScanPolicy,
    );

    const result = await adapter.provision(command());

    expect(result.ok).toBe(false);
    expect(workflows.createInterest.commands).toHaveLength(1);
    expect(failedBindSource.commands).toHaveLength(1);
    expect(workflows.setScanPolicy.commands).toEqual([]);
  });
});

const createAdapter = (
  workflows: ReturnType<typeof recordingWorkflows>,
): MonitoringInterestSourceProvisionerAdapter =>
  new MonitoringInterestSourceProvisionerAdapter(
    workflows.createInterest,
    workflows.bindSource,
    workflows.setScanPolicy,
  );

const command = (
  overrides: Partial<ProvisionInterestSourceCommand> = {},
): ProvisionInterestSourceCommand => ({
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  descriptor: descriptor(),
  idempotencyKey: 'activate-1',
  correlationId: 'corr-1',
  ...overrides,
});

const descriptor = (
  overrides: Partial<SourceTargetDescriptor> = {},
): SourceTargetDescriptor => ({
  providerKey: 'x-twitter',
  targetKind: 'search_query',
  targetValue: 'ai',
  normalizedKey: 'x-twitter:search_query:ai',
  config: {},
  ...overrides,
});

const recordingWorkflows = () => ({
  createInterest: {
    commands: [] as unknown[],
    async execute(workflowCommand: unknown) {
      this.commands.push(workflowCommand);
      return ok({ interestId: 'interest-1', created: true });
    },
  },
  bindSource: {
    commands: [] as unknown[],
    async execute(workflowCommand: unknown) {
      this.commands.push(workflowCommand);
      return ok({ sourceBindingId: 'binding-1', created: true });
    },
  },
  setScanPolicy: {
    commands: [] as unknown[],
    async execute(workflowCommand: unknown) {
      this.commands.push(workflowCommand);
      return ok({
        scanPolicyId: 'policy-1',
        created: true,
        updated: false,
      });
    },
  },
});
