import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { InMemorySummaryEventPublisher } from '@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher';
import { InMemorySummaryArtifactRepository } from '@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository';
import { ExecuteSummaryJobUseCase } from '@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

type SubscriptionRequest = {
  readonly userId: string;
  readonly providerKey: string;
  readonly targetKind: string;
  readonly targetValue: string;
  readonly recipientKey?: string;
  readonly intervalSeconds?: number;
  readonly summaryInstructions?: string;
};

describe('User subscriptions personalized summary flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a provider target subscription and applies its summary prompt overlay at execution time', async () => {
    const tenant = tenantId('tenant-user-subscriptions-e2e');
    const workspace = workspaceId('workspace-user-subscriptions-e2e');
    const userId = 'user-alice';

    const created = await createSubscription(app, tenant, workspace, {
      userId,
      providerKey: 'reddit',
      targetKind: 'subreddit',
      targetValue: 'r/programming',
      summaryInstructions: 'Focus on security-impacting developer discussions.',
    }).expect(201);

    expect(created.body).toEqual({
      created: true,
      sourceTarget: expect.objectContaining({
        id: expect.any(String),
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'programming',
        normalizedKey: 'reddit:subreddit:programming',
      }),
      subscription: expect.objectContaining({
        id: expect.any(String),
        userId,
        status: 'enabled',
      }),
      schedule: expect.objectContaining({
        subscriptionId: expect.any(String),
        recipientKey: userId,
        channel: 'in_app',
        intervalSeconds: 3600,
      }),
      summaryPreference: expect.objectContaining({
        userId,
        subscriptionId: expect.any(String),
        customInstructions: 'Focus on security-impacting developer discussions.',
      }),
    });

    const subscriptionId = created.body.subscription.id as string;
    expect(created.body.schedule.subscriptionId).toBe(subscriptionId);
    expect(created.body.summaryPreference.subscriptionId).toBe(subscriptionId);

    const listed = await request(app.getHttpServer())
      .get('/user-subscriptions')
      .query({ userId })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(listed.body.subscriptions).toHaveLength(1);
    expect(listed.body.subscriptions[0]).toMatchObject({
      sourceTarget: {
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'programming',
      },
      subscription: {
        id: subscriptionId,
        userId,
      },
      summaryPreference: {
        customInstructions: 'Focus on security-impacting developer discussions.',
      },
    });

    const execution = await requestAndExecuteSummary(app, tenant, workspace, {
      topicId: 'topic-user-subscription-summary-e2e',
      idempotencyKey: 'personalized-summary-request-1',
      userId,
      subscriptionId,
    });
    const snapshot = execution.artifact.toSnapshot();

    expect(snapshot).toMatchObject({
      userId,
      subscriptionId,
      topicId: 'topic-user-subscription-summary-e2e',
      executiveSummary: expect.stringContaining('Focus on security-impacting developer discussions.'),
      lineage: expect.objectContaining({
        rulesVersion: 'summary.rules.policy.v1+summary.rules.user-preference.v1',
      }),
    });

    expect(app.get(InMemorySummaryEventPublisher).all()).toContainEqual(
      expect.objectContaining({
        eventType: 'summary.ready',
        payload: expect.objectContaining({
          summaryJobId: execution.summaryJobId,
          summaryId: execution.summaryId,
          topicId: 'topic-user-subscription-summary-e2e',
          userId,
          subscriptionId,
          status: 'no_signal',
        }),
      }),
    );
  });

  it('normalizes provider targets and reuses the same subscription on duplicate create', async () => {
    const tenant = tenantId('tenant-user-subscription-duplicate-e2e');
    const workspace = workspaceId('workspace-user-subscription-duplicate-e2e');
    const userId = 'user-duplicate';

    const first = await createSubscription(app, tenant, workspace, {
      userId,
      providerKey: 'Reddit',
      targetKind: 'subreddit',
      targetValue: 'r/TypeScript',
      intervalSeconds: 3600,
      summaryInstructions: 'First prompt.',
    }).expect(201);

    const second = await createSubscription(app, tenant, workspace, {
      userId,
      providerKey: 'reddit',
      targetKind: 'subreddit',
      targetValue: 'typescript',
      intervalSeconds: 7200,
      summaryInstructions: 'Updated prompt.',
    }).expect(201);

    expect(second.body.created).toBe(false);
    expect(second.body.sourceTarget.id).toBe(first.body.sourceTarget.id);
    expect(second.body.subscription.id).toBe(first.body.subscription.id);
    expect(second.body.schedule).toEqual(expect.objectContaining({
      subscriptionId: first.body.subscription.id,
      intervalSeconds: 7200,
    }));
    expect(second.body.summaryPreference).toEqual(expect.objectContaining({
      id: first.body.summaryPreference.id,
      subscriptionId: first.body.subscription.id,
      customInstructions: 'Updated prompt.',
    }));

    const listed = await request(app.getHttpServer())
      .get('/user-subscriptions')
      .query({ userId })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(listed.body.subscriptions).toHaveLength(1);
    expect(listed.body.subscriptions[0]).toMatchObject({
      sourceTarget: {
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'typescript',
        normalizedKey: 'reddit:subreddit:typescript',
      },
      schedule: {
        intervalSeconds: 7200,
      },
      summaryPreference: {
        customInstructions: 'Updated prompt.',
      },
    });
  });

  it('supports provider-specific target kinds beyond reddit', async () => {
    const tenant = tenantId('tenant-user-subscription-providers-e2e');
    const workspace = workspaceId('workspace-user-subscription-providers-e2e');
    const userId = 'user-provider-matrix';

    const github = await createSubscription(app, tenant, workspace, {
      userId,
      providerKey: 'github',
      targetKind: 'repository',
      targetValue: 'https://github.com/OpenAI/Codex.git',
    }).expect(201);
    const xTwitter = await createSubscription(app, tenant, workspace, {
      userId,
      providerKey: 'x-twitter',
      targetKind: 'account',
      targetValue: '@OpenAI',
    }).expect(201);

    expect(github.body.sourceTarget).toEqual(expect.objectContaining({
      providerKey: 'github',
      targetKind: 'repository',
      targetValue: 'openai/codex',
      normalizedKey: 'github:repository:openai/codex',
    }));
    expect(xTwitter.body.sourceTarget).toEqual(expect.objectContaining({
      providerKey: 'x-twitter',
      targetKind: 'account',
      targetValue: 'openai',
      normalizedKey: 'x-twitter:account:openai',
    }));

    const listed = await request(app.getHttpServer())
      .get('/user-subscriptions')
      .query({ userId })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(listed.body.subscriptions).toHaveLength(2);
    expect(listed.body.subscriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceTarget: expect.objectContaining({
          normalizedKey: 'github:repository:openai/codex',
        }),
      }),
      expect.objectContaining({
        sourceTarget: expect.objectContaining({
          normalizedKey: 'x-twitter:account:openai',
        }),
      }),
    ]));
  });

  it('activates a canonical X source pipeline through the product subscription flow', async () => {
    const tenant = tenantId('tenant-x-activation-e2e');
    const workspace = workspaceId('workspace-x-activation-e2e');
    const userId = 'user-x-activation';

    const activated = await request(app.getHttpServer())
      .post('/user-subscriptions/activate-source')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .send({
        userId,
        providerKey: 'x-twitter-experimental-daily',
        targetKind: 'search_query',
        targetValue: 'OpenAI Agents',
        targetConfig: {
          language: 'en',
          maxItems: 40,
        },
        schedule: {
          recipientKey: userId,
          channel: 'in_app',
          intervalSeconds: 3600,
          includeNoSignal: true,
        },
        scanPolicy: {
          intervalSeconds: 3600,
          freshnessSeconds: 3600,
          retryBudget: 4,
        },
        summaryPreference: {
          language: 'en',
          format: 'risk_brief',
          tone: 'analytical',
          maxKeyPoints: 3,
          includeRisks: true,
          includeSourceHighlights: true,
          customInstructions: 'Prioritize high-engagement X posts from today.',
        },
      })
      .expect(201);

    expect(activated.body).toEqual(expect.objectContaining({
      created: true,
      topicId: expect.any(String),
      sourceBindingId: expect.any(String),
      scanPolicyId: expect.any(String),
      sourceTarget: expect.objectContaining({
        providerKey: 'x-twitter',
        targetKind: 'search_query',
        targetValue: 'openai agents',
        normalizedKey: 'x-twitter:search_query:openai agents',
      }),
      subscription: expect.objectContaining({
        userId,
        status: 'enabled',
      }),
      activation: {
        topicCreated: true,
        sourceBindingCreated: true,
        scanPolicyCreated: true,
        scanPolicyUpdated: false,
      },
    }));

    const topics = await request(app.getHttpServer())
      .get('/topics')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(topics.body.topics).toEqual([
      expect.objectContaining({
        id: activated.body.topicId,
        name: 'openai agents',
        query: 'openai agents',
      }),
    ]);

    const bindings = await request(app.getHttpServer())
      .get(`/topics/${activated.body.topicId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(bindings.body.sourceBindings).toEqual([
      expect.objectContaining({
        id: activated.body.sourceBindingId,
        providerKey: 'x-twitter',
        configPreview: expect.objectContaining({
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

    const policy = await request(app.getHttpServer())
      .get(`/source-bindings/${activated.body.sourceBindingId}/scan-policy`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(policy.body).toEqual(expect.objectContaining({
      id: activated.body.scanPolicyId,
      sourceBindingId: activated.body.sourceBindingId,
      intervalSeconds: 86_400,
      freshnessSeconds: 86_400,
      retryBudget: 4,
      cadence: expect.objectContaining({
        providerKey: 'x-twitter',
        minimumIntervalSeconds: 86_400,
        providerMinimumIntervalEnforced: false,
      }),
    }));
  });

  it('updates subscription summary preference only for the owning user', async () => {
    const tenant = tenantId('tenant-user-subscription-preference-update-e2e');
    const workspace = workspaceId('workspace-user-subscription-preference-update-e2e');
    const userId = 'user-owner';

    const created = await createSubscription(app, tenant, workspace, {
      userId,
      providerKey: 'reddit',
      targetKind: 'subreddit',
      targetValue: 'r/node',
      summaryInstructions: undefined,
    }).expect(201);
    const subscriptionId = created.body.subscription.id as string;

    await request(app.getHttpServer())
      .put(`/user-subscriptions/${subscriptionId}/summary-preference`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .send({
        userId: 'user-intruder',
        customInstructions: 'This prompt must not be attached.',
      })
      .expect(404)
      .expect((response) => {
        expect(response.body.code).toBe('resource.not_found');
      });

    const firstPreference = await request(app.getHttpServer())
      .put(`/user-subscriptions/${subscriptionId}/summary-preference`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .send({
        userId,
        language: 'en',
        tone: 'analytical',
        customInstructions: 'Track runtime regressions and supply-chain risk.',
      })
      .expect(200);
    const secondPreference = await request(app.getHttpServer())
      .put(`/user-subscriptions/${subscriptionId}/summary-preference`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .send({
        userId,
        language: 'en',
        format: 'risk_brief',
        tone: 'analytical',
        customInstructions: 'Prioritize breaking API changes.',
      })
      .expect(200);

    expect(firstPreference.body).toEqual({
      created: true,
      summaryPreference: expect.objectContaining({
        userId,
        subscriptionId,
        customInstructions: 'Track runtime regressions and supply-chain risk.',
      }),
    });
    expect(secondPreference.body).toEqual({
      created: false,
      summaryPreference: expect.objectContaining({
        id: firstPreference.body.summaryPreference.id,
        userId,
        subscriptionId,
        customInstructions: 'Prioritize breaking API changes.',
      }),
    });

    const execution = await requestAndExecuteSummary(app, tenant, workspace, {
      topicId: 'topic-user-subscription-updated-preference-e2e',
      idempotencyKey: 'personalized-summary-request-updated-preference-1',
      userId,
      subscriptionId,
    });

    expect(execution.artifact.toSnapshot()).toMatchObject({
      userId,
      subscriptionId,
      executiveSummary: expect.stringContaining('Prioritize breaking API changes.'),
    });
  });

  it('applies topic-level user summary preference when no subscription scope is requested', async () => {
    const tenant = tenantId('tenant-topic-user-summary-preference-e2e');
    const workspace = workspaceId('workspace-topic-user-summary-preference-e2e');
    const topicId = 'topic-user-summary-preference-e2e';
    const userId = 'user-topic-overlay';

    const preference = await request(app.getHttpServer())
      .put(`/topics/${topicId}/user-summary-preference`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .send({
        userId,
        language: 'ru',
        format: 'bullet_digest',
        tone: 'concise',
        customInstructions: 'Use founder-friendly wording.',
      })
      .expect(200);

    expect(preference.body).toEqual({
      created: true,
      summaryPreference: expect.objectContaining({
        userId,
        topicId,
        customInstructions: 'Use founder-friendly wording.',
      }),
    });

    const execution = await requestAndExecuteSummary(app, tenant, workspace, {
      topicId,
      idempotencyKey: 'topic-user-summary-preference-request-1',
      userId,
    });
    const snapshot = execution.artifact.toSnapshot();

    expect(snapshot.userId).toBe(userId);
    expect(snapshot.subscriptionId).toBeUndefined();
    expect(snapshot.executiveSummary).toContain('Use founder-friendly wording.');
    expect(snapshot.lineage.rulesVersion).toBe('summary.rules.policy.v1+summary.rules.user-preference.v1');
  });

  it('rejects invalid subscription requests before controller logic dereferences the body', async () => {
    await request(app.getHttpServer())
      .post('/user-subscriptions')
      .set('x-tenant-id', 'tenant-user-subscription-validation-e2e')
      .set('x-workspace-id', 'workspace-user-subscription-validation-e2e')
      .set('x-workspace-role', 'member')
      .send({
        userId: 'user-validation',
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'programming',
      })
      .expect(400)
      .expect((response) => {
        expect(response.headers['content-type']).toContain('application/problem+json');
        expect(response.body.code).toBe('validation.failed');
        expect(response.body.details.messages).toEqual(expect.arrayContaining([
          expect.stringContaining('schedule should not be null or undefined'),
        ]));
      });
  });

  it('rejects inline credential material in source activation target config without echoing secrets', async () => {
    await request(app.getHttpServer())
      .post('/user-subscriptions/activate-source')
      .set('x-tenant-id', 'tenant-source-activation-secret-boundary-e2e')
      .set('x-workspace-id', 'workspace-source-activation-secret-boundary-e2e')
      .set('x-workspace-role', 'member')
      .send({
        userId: 'user-source-activation-secret-boundary',
        providerKey: 'reddit',
        targetKind: 'subreddit',
        targetValue: 'programming',
        targetConfig: {
          listing: 'hot',
          accessToken: 'raw-activation-token',
        },
        schedule: {
          recipientKey: 'user-source-activation-secret-boundary',
          channel: 'in_app',
          intervalSeconds: 3600,
          includeNoSignal: true,
        },
      })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('validation.failed');
        expect(response.body.detail).toContain('inline credential field: accessToken');
        expect(JSON.stringify(response.body)).not.toContain('raw-activation-token');
      });
  });

  it('rejects subscription-scoped summary requests without a user id', async () => {
    await request(app.getHttpServer())
      .post('/topics/topic-subscription-scope-validation-e2e/summary-requests')
      .set('x-tenant-id', 'tenant-summary-subscription-validation-e2e')
      .set('x-workspace-id', 'workspace-summary-subscription-validation-e2e')
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-subscription-validation-request-1')
      .set('idempotency-key', 'summary-subscription-validation-request-1')
      .send({
        subscriptionId: 'subscription-without-user',
      })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('validation.failed');
      });
  });

  it('rejects idempotency-key reuse across different personalized summary scopes', async () => {
    const tenant = tenantId('tenant-summary-idempotency-scope-e2e');
    const workspace = workspaceId('workspace-summary-idempotency-scope-e2e');
    const topicId = 'topic-summary-idempotency-scope-e2e';

    const first = await request(app.getHttpServer())
      .post(`/topics/${topicId}/summary-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-idempotency-scope-request-1')
      .set('idempotency-key', 'summary-idempotency-scope-request-1')
      .send({
        userId: 'user-idempotency-a',
      })
      .expect(201);

    expect(first.body).toEqual({
      summaryJobId: expect.any(String),
      status: 'requested',
      created: true,
    });

    await request(app.getHttpServer())
      .post(`/topics/${topicId}/summary-requests`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'member')
      .set('x-request-id', 'summary-idempotency-scope-request-2')
      .set('idempotency-key', 'summary-idempotency-scope-request-1')
      .send({
        userId: 'user-idempotency-b',
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.code).toBe('operation.conflict');
      });
  });
});

const createSubscription = (
  app: INestApplication,
  tenant: TenantId,
  workspace: WorkspaceId,
  params: SubscriptionRequest,
) =>
  request(app.getHttpServer())
    .post('/user-subscriptions')
    .set('x-tenant-id', tenant)
    .set('x-workspace-id', workspace)
    .set('x-workspace-role', 'member')
    .send({
      userId: params.userId,
      providerKey: params.providerKey,
      targetKind: params.targetKind,
      targetValue: params.targetValue,
      targetConfig: {
        source: 'e2e',
      },
      schedule: {
        recipientKey: params.recipientKey ?? params.userId,
        channel: 'in_app',
        intervalSeconds: params.intervalSeconds ?? 3600,
        includeNoSignal: true,
      },
      ...(params.summaryInstructions === undefined
        ? {}
        : {
            summaryPreference: {
              language: 'en',
              format: 'risk_brief',
              tone: 'analytical',
              maxKeyPoints: 3,
              includeRisks: true,
              includeSourceHighlights: false,
              customInstructions: params.summaryInstructions,
            },
          }),
    });

const requestAndExecuteSummary = async (
  app: INestApplication,
  tenant: TenantId,
  workspace: WorkspaceId,
  params: {
    readonly topicId: string;
    readonly idempotencyKey: string;
    readonly userId: string;
    readonly subscriptionId?: string;
  },
): Promise<{
  readonly summaryJobId: string;
  readonly summaryId: string;
  readonly artifact: NonNullable<Awaited<ReturnType<InMemorySummaryArtifactRepository['findById']>>>;
}> => {
  const requested = await request(app.getHttpServer())
    .post(`/topics/${params.topicId}/summary-requests`)
    .set('x-tenant-id', tenant)
    .set('x-workspace-id', workspace)
    .set('x-workspace-role', 'member')
    .set('x-request-id', params.idempotencyKey)
    .set('idempotency-key', params.idempotencyKey)
    .send({
      userId: params.userId,
      ...(params.subscriptionId === undefined ? {} : { subscriptionId: params.subscriptionId }),
    })
    .expect(201);

  const result = await app.get(ExecuteSummaryJobUseCase).execute({
    tenantId: tenant,
    workspaceId: workspace,
    summaryJobId: requested.body.summaryJobId,
  });

  expect(result).toEqual({
    ok: true,
    value: {
      summaryJobId: requested.body.summaryJobId,
      status: 'no_signal',
      summaryId: expect.any(String),
    },
  });

  if (!result.ok || result.value.summaryId === undefined) {
    throw new Error('Expected personalized summary artifact');
  }

  const artifact = await app.get(InMemorySummaryArtifactRepository).findById({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: result.value.summaryId,
  });

  if (artifact === null) {
    throw new Error('Expected persisted personalized summary artifact');
  }

  return {
    summaryJobId: requested.body.summaryJobId as string,
    summaryId: result.value.summaryId,
    artifact,
  };
};
