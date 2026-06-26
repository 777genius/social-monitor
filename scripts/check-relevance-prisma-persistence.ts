import { FixedClock, type IdGenerator, isOk, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { PrismaRelevanceFeedbackRepository } from '../libs/relevance/adapters/persistence/prisma/prisma-relevance-feedback.repository';
import type {
  PrismaRelevanceClient,
  PrismaRelevanceTransactionClient,
  PrismaRelevanceTransactionOptions,
} from '../libs/relevance/adapters/persistence/prisma/prisma-relevance-client';
import { PrismaRelevanceFeedbackLearningStore } from '../libs/relevance/adapters/persistence/prisma/prisma-relevance-feedback-learning.store';
import type {
  PrismaRelevanceFeedbackSignalRecord,
  PrismaRelevanceMemoryProjectionRecord,
  PrismaUserRelevanceProfileRecord,
} from '../libs/relevance/adapters/persistence/prisma/prisma-relevance-records';
import { PrismaUserRelevanceProfileRepository } from '../libs/relevance/adapters/persistence/prisma/prisma-user-relevance-profile.repository';
import { RecordRelevanceFeedbackUseCase } from '../libs/relevance/features/record-relevance-feedback/record-relevance-feedback.use-case';
import { UpsertUserRelevanceProfileUseCase } from '../libs/relevance/features/upsert-user-relevance-profile/upsert-user-relevance-profile.use-case';
import { resolveRelevancePersistenceMode } from '../libs/relevance/interfaces/rest/relevance-provider-tokens';

const clock = new FixedClock(new Date('2026-06-22T09:00:00.000Z'));
const tenant = tenantId('00000000-0000-7000-8000-000000000a01');
const workspace = workspaceId('00000000-0000-7000-8000-000000000a02');
const userId = '00000000-0000-7000-8000-000000000a03';

async function main(): Promise<void> {
  assert(resolveRelevancePersistenceMode({}) === 'in-memory', 'relevance persistence must default to in-memory');
  assertThrows(
    () => resolveRelevancePersistenceMode({ RELEVANCE_PERSISTENCE: 'prisma' }),
    'RELEVANCE_PERSISTENCE=prisma must require DATABASE_URL',
  );
  assert(
    resolveRelevancePersistenceMode({
      RELEVANCE_PERSISTENCE: 'prisma',
      DATABASE_URL: 'postgresql://example.test/social-monitor',
    }) === 'prisma',
    'relevance persistence must accept explicit Prisma mode with DATABASE_URL',
  );

  const prisma = new FakePrismaRelevanceClient();
  const profiles = new PrismaUserRelevanceProfileRepository(prisma);
  const feedback = new PrismaRelevanceFeedbackRepository(prisma);
  const ids = new SequenceIdGenerator([
    '00000000-0000-7000-8000-000000000a11',
    '00000000-0000-7000-8000-000000000a12',
    '00000000-0000-7000-8000-000000000a13',
    '00000000-0000-7000-8000-000000000a14',
  ]);

  const upserted = await new UpsertUserRelevanceProfileUseCase(profiles, ids, clock).execute({
    tenantId: tenant,
    workspaceId: workspace,
    userId,
    topicWeights: [{ key: 'ai', weight: 1.25 }],
    sourceWeights: [{ key: 'reddit', weight: 0.8 }],
    keywordWeights: [{ key: 'launch', weight: 0.5 }],
    mutedKeywords: ['giveaway'],
    blockedProviderKeys: [],
  });
  if (!isOk(upserted)) {
    throw new Error('user relevance profile upsert must succeed through Prisma repository');
  }
  assert(upserted.value.created === true, 'first profile upsert must create durable profile');

  const foundProfile = await profiles.findByUser({ tenantId: tenant, workspaceId: workspace, userId });
  if (foundProfile === null) {
    throw new Error('user relevance profile must be readable by tenant/workspace/user');
  }
  assert(foundProfile.topicWeight('ai') === 1.25, 'topic weight must round-trip through Prisma mapping');
  assert(foundProfile.sourceWeight('reddit') === 0.8, 'source weight must round-trip through Prisma mapping');
  assert(foundProfile.hasMutedKeyword('Weekly AI giveaway') === true, 'muted keywords must round-trip');

  const learning = new PrismaRelevanceFeedbackLearningStore(prisma);

  const recorded = await new RecordRelevanceFeedbackUseCase(learning, ids, clock).execute({
    tenantId: tenant,
    workspaceId: workspace,
    userId,
    idempotencyKey: 'feedback:reddit:launch:1',
    action: 'more_like_this',
    rating: 5,
    target: {
      feedItemId: 'feed-1',
      topicId: 'ai',
      providerKey: 'reddit',
      title: 'Open source AI launch reaches beta users',
      bodyPreview: 'The team published launch details and early beta feedback.',
      canonicalUrl: 'https://reddit.example.test/r/socialmonitor/comments/1',
    },
  });
  if (!isOk(recorded)) {
    throw new Error('relevance feedback must persist through Prisma repository');
  }
  assert(recorded.value.created === true, 'first feedback write must be created');
  assert(recorded.value.learningDirection === 'positive', 'positive feedback must produce positive learning');
  assert(
    await feedback.findByIdempotencyKey({
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'feedback:reddit:launch:1',
    }) !== null,
    'feedback signal must be readable through Prisma feedback repository',
  );

  const learnedProfile = await profiles.findByUser({ tenantId: tenant, workspaceId: workspace, userId });
  if (learnedProfile === null) {
    throw new Error('learned profile must stay durable');
  }
  assert(learnedProfile.topicWeight('ai') === 1.5, 'feedback must raise topic weight once');
  assert(learnedProfile.sourceWeight('reddit') === 1.05, 'feedback must raise source weight once');
  assert(learnedProfile.keywordWeight('launch') > 0.5, 'feedback must raise matching keyword weight');

  const cached = await new RecordRelevanceFeedbackUseCase(learning, ids, clock).execute({
    tenantId: tenant,
    workspaceId: workspace,
    userId,
    idempotencyKey: 'feedback:reddit:launch:1',
    action: 'more_like_this',
    rating: 5,
    target: {
      feedItemId: 'feed-1',
      topicId: 'ai',
      providerKey: 'reddit',
      title: 'Open source AI launch reaches beta users',
      bodyPreview: 'The team published launch details and early beta feedback.',
      canonicalUrl: 'https://reddit.example.test/r/socialmonitor/comments/1',
    },
  });
  if (!isOk(cached)) {
    throw new Error('idempotent feedback retry must succeed');
  }
  assert(cached.value.created === false, 'idempotent feedback retry must return cached signal');

  const afterRetryProfile = await profiles.findByUser({ tenantId: tenant, workspaceId: workspace, userId });
  assert(afterRetryProfile?.topicWeight('ai') === 1.5, 'idempotent retry must not double-apply learning');
  assert(prisma.relevanceMemoryProjectionRecords().length === 1, 'idempotent retry must not duplicate memory projection');

  console.log('Relevance Prisma persistence smoke OK');
}

class SequenceIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  generate(): string {
    const value = this.values[this.index];

    if (value === undefined) {
      throw new Error('SequenceIdGenerator exhausted');
    }

    this.index += 1;

    return value;
  }
}

class FakePrismaRelevanceClient implements PrismaRelevanceClient {
  private readonly profiles = new Map<string, PrismaUserRelevanceProfileRecord>();
  private readonly feedbackSignals = new Map<string, PrismaRelevanceFeedbackSignalRecord>();
  private readonly memoryProjections = new Map<string, PrismaRelevanceMemoryProjectionRecord>();

  readonly userRelevanceProfile: PrismaRelevanceClient['userRelevanceProfile'] = {
    upsert: async (args) => {
      const key = profileKey(args.where.tenantId_workspaceId_userId);
      const existing = this.profiles.get(key);
      const record: PrismaUserRelevanceProfileRecord = {
        ...(existing ?? args.create),
        ...args.update,
      };
      this.profiles.set(key, record);

      return record;
    },
    findFirst: async (args) => this.profiles.get(profileKey(args.where)) ?? null,
  };

  readonly relevanceFeedbackSignal: PrismaRelevanceClient['relevanceFeedbackSignal'] = {
    upsert: async (args) => {
      const key = feedbackKey(args.where.tenantId_workspaceId_idempotencyKey);
      const existing = this.feedbackSignals.get(key);

      if (existing !== undefined) {
        return existing;
      }

      const record: PrismaRelevanceFeedbackSignalRecord = {
        ...args.create,
        rating: args.create.rating ?? null,
      };
      this.feedbackSignals.set(key, record);

      return record;
    },
    findFirst: async (args) => this.feedbackSignals.get(feedbackKey(args.where)) ?? null,
  };

  readonly relevanceMemoryProjection: PrismaRelevanceClient['relevanceMemoryProjection'] = {
    upsert: async (args) => {
      const key = memoryProjectionKey(args.where.tenantId_workspaceId_feedbackId);
      const existing = this.memoryProjections.get(key);
      const record: PrismaRelevanceMemoryProjectionRecord = {
        ...(existing ?? args.create),
        ...args.update,
      };
      this.memoryProjections.set(key, record);

      return record;
    },
    findMany: async (args) =>
      [...this.memoryProjections.values()]
        .filter((record) =>
          args.where.status.in.includes(record.status) &&
          record.nextAttemptAt.getTime() <= args.where.nextAttemptAt.lte.getTime() &&
          (args.where.tenantId === undefined || record.tenantId === args.where.tenantId) &&
          (args.where.workspaceId === undefined || record.workspaceId === args.where.workspaceId))
        .slice(0, args.take),
    update: async (args) => {
      const existing = [...this.memoryProjections.values()].find((record) => record.id === args.where.id);
      if (existing === undefined) {
        throw new Error('Relevance memory projection not found');
      }
      const record = { ...existing, ...args.data };
      this.memoryProjections.set(memoryProjectionKey(record), record);

      return record;
    },
  };

  relevanceMemoryProjectionRecords(): readonly PrismaRelevanceMemoryProjectionRecord[] {
    return [...this.memoryProjections.values()];
  }

  async $transaction<TValue>(
    operation: (client: PrismaRelevanceTransactionClient) => Promise<TValue>,
    options?: PrismaRelevanceTransactionOptions,
  ): Promise<TValue> {
    void options;
    return operation(this);
  }
}

const profileKey = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
}): string => [params.tenantId, params.workspaceId, params.userId].join(':');

const feedbackKey = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly idempotencyKey: string;
}): string => [params.tenantId, params.workspaceId, params.idempotencyKey].join(':');

const memoryProjectionKey = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly feedbackId: string;
}): string => [params.tenantId, params.workspaceId, params.feedbackId].join(':');

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertThrows = (fn: () => unknown, message: string): void => {
  try {
    fn();
  } catch {
    return;
  }

  throw new Error(message);
};

void main();
