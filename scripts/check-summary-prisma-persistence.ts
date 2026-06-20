import {
  causationId,
  correlationId,
  eventId,
  FixedClock,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { SummaryArtifact, SummaryFeedback, SummaryJob, SummaryPolicy } from '../libs/summary/domain';
import { PrismaSummaryArtifactRepository } from '../libs/summary/adapters/persistence/prisma/prisma-summary-artifact.repository';
import type { PrismaSummaryClient } from '../libs/summary/adapters/persistence/prisma/prisma-summary-client';
import { PrismaSummaryEventPublisher } from '../libs/summary/adapters/persistence/prisma/prisma-summary-event.publisher';
import { PrismaSummaryFeedbackRepository } from '../libs/summary/adapters/persistence/prisma/prisma-summary-feedback.repository';
import { PrismaSummaryJobRepository } from '../libs/summary/adapters/persistence/prisma/prisma-summary-job.repository';
import { PrismaSummaryPolicyRepository } from '../libs/summary/adapters/persistence/prisma/prisma-summary-policy.repository';
import { resolveSummaryPersistenceMode } from '../libs/summary/interfaces/rest/summary-provider-tokens';
import type {
  PrismaSummaryArtifactRecord,
  PrismaSummaryFeedbackRecord,
  PrismaSummaryJobRecord,
  PrismaSummaryOutboxEventRecord,
  PrismaSummaryPolicyRecord,
  PrismaSummaryStatus,
} from '../libs/summary/adapters/persistence/prisma/prisma-summary-records';

const clock = new FixedClock(new Date('2026-06-08T00:00:00.000Z'));
const tenant = tenantId('00000000-0000-7000-8000-000000000401');
const workspace = workspaceId('00000000-0000-7000-8000-000000000402');
const topicId = '00000000-0000-7000-8000-000000000403';

async function main(): Promise<void> {
  assert(resolveSummaryPersistenceMode({}) === 'in-memory', 'summary persistence must default to in-memory');
  assertThrows(
    () => resolveSummaryPersistenceMode({ SUMMARY_PERSISTENCE: 'prisma' }),
    'SUMMARY_PERSISTENCE=prisma must require DATABASE_URL',
  );
  assert(
    resolveSummaryPersistenceMode({
      SUMMARY_PERSISTENCE: 'prisma',
      DATABASE_URL: 'postgresql://example.test/social-monitor',
    }) === 'prisma',
    'summary persistence must accept explicit Prisma mode with DATABASE_URL',
  );

  const prisma = new FakePrismaSummaryClient();
  const summaryJobs = new PrismaSummaryJobRepository(prisma);
  const summaryArtifacts = new PrismaSummaryArtifactRepository(prisma);
  const feedbackRepository = new PrismaSummaryFeedbackRepository(prisma);
  const summaryPolicies = new PrismaSummaryPolicyRepository(prisma);
  const summaryEvents = new PrismaSummaryEventPublisher(prisma);
  const completedArtifact = makeCompletedArtifact('00000000-0000-7000-8000-000000000501');
  const noSignalArtifact = makeNoSignalArtifact('00000000-0000-7000-8000-000000000502');

  await summaryArtifacts.save(completedArtifact);
  await summaryArtifacts.save(noSignalArtifact);

  const requestedJob = SummaryJob.request({
    id: '00000000-0000-7000-8000-000000000601',
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    idempotencyKey: 'summary-job:topic:2026-06-08',
    requestedAt: clock.now(),
  });
  await summaryJobs.save(requestedJob);
  const runningJob = requestedJob.start({ startedAt: new Date('2026-06-08T00:01:00.000Z') });
  await summaryJobs.save(runningJob);
  const completedJob = runningJob.complete({
    completedAt: new Date('2026-06-08T00:02:00.000Z'),
    summaryId: completedArtifact.toSnapshot().summaryId,
  });
  await summaryJobs.save(completedJob);

  const foundJob = await summaryJobs.findByIdempotencyKey({
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'summary-job:topic:2026-06-08',
  });
  assert(foundJob?.toSnapshot().status === 'completed', 'summary job status must round-trip as completed');
  assert(
    foundJob.toSnapshot().summaryId === completedArtifact.toSnapshot().summaryId,
    'completed summary job must keep artifact reference',
  );

  const noSignalJob = SummaryJob.request({
    id: '00000000-0000-7000-8000-000000000602',
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    idempotencyKey: 'summary-job:topic:2026-06-08:no-signal',
    requestedAt: clock.now(),
  }).start({ startedAt: new Date('2026-06-08T00:03:00.000Z') }).markNoSignal({
    completedAt: new Date('2026-06-08T00:04:00.000Z'),
    summaryId: noSignalArtifact.toSnapshot().summaryId,
  });
  await summaryJobs.save(noSignalJob);

  const listed = await summaryArtifacts.list({ tenantId: tenant, workspaceId: workspace, topicId, limit: 1 });
  assert(listed.items.length === 1, 'summary artifact repository must page first item');
  assert(listed.nextCursor !== undefined, 'summary artifact repository must return cursor when more items exist');
  const secondPage = await summaryArtifacts.list({
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    limit: 1,
    cursor: listed.nextCursor,
  });
  assert(secondPage.items.length === 1, 'summary artifact repository must page second item');

  const foundArtifact = await summaryArtifacts.findById({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: completedArtifact.toSnapshot().summaryId,
  });
  assert(foundArtifact !== null, 'summary artifact findById must return saved artifact');
  const foundSnapshot = foundArtifact.toSnapshot();
  assert(foundSnapshot.executiveSummary === 'Durable summary body', 'summary artifact text must rehydrate');
  assert(
    foundSnapshot.sourceWindow.startedAt.toISOString() === '2026-06-08T00:00:00.000Z',
    'summary artifact source window start must rehydrate as Date',
  );

  const feedback = SummaryFeedback.record({
    id: '00000000-0000-7000-8000-000000000701',
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: completedArtifact.toSnapshot().summaryId,
    topicId,
    idempotencyKey: 'feedback:summary:durable',
    submittedBy: 'beta-user@example.test',
    rating: 2,
    category: 'bad_citation',
    comment: 'The cited item does not support the claim.',
    evidence: {
      summaryId: completedArtifact.toSnapshot().summaryId,
      topicId,
      citationId: 'citation-1',
      feedItemId: 'feed-1',
      sourceItemId: 'source-1',
    },
    triageOwner: 'summary-owner',
    eligibleForEvalFixture: true,
    createdAt: clock.now(),
  });
  await feedbackRepository.save(feedback);

  const foundFeedback = await feedbackRepository.findByIdempotencyKey({
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'feedback:summary:durable',
  });
  assert(foundFeedback?.toSnapshot().category === 'bad_citation', 'summary feedback category must round-trip');
  assert(
    foundFeedback.toSnapshot().evidence.citationId === 'citation-1',
    'summary feedback evidence must round-trip',
  );

  const listedFeedback = await feedbackRepository.list({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: completedArtifact.toSnapshot().summaryId,
    limit: 1,
  });
  assert(listedFeedback.items.length === 1, 'summary feedback repository must list saved feedback');
  assert(
    listedFeedback.items[0]?.toSnapshot().id === feedback.toSnapshot().id,
    'summary feedback repository list must preserve feedback identity',
  );

  const policy = SummaryPolicy.create({
    id: '00000000-0000-7000-8000-000000000801',
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    language: 'ru',
    format: 'bullet_digest',
    tone: 'analytical',
    maxKeyPoints: 7,
    includeRisks: true,
    includeSourceHighlights: false,
    customInstructions: 'Focus on launch and pricing signals.',
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  await summaryPolicies.save(policy);
  const foundPolicy = await summaryPolicies.findByTopic({ tenantId: tenant, workspaceId: workspace, topicId });
  assert(foundPolicy?.toSnapshot().language === 'ru', 'summary policy language must round-trip');
  assert(
    foundPolicy.toSnapshot().customInstructions === 'Focus on launch and pricing signals.',
    'summary policy custom instructions must round-trip',
  );

  await summaryEvents.publish({
    eventId: eventId('00000000-0000-7000-8000-000000000901'),
    eventType: 'summary.ready',
    schemaVersion: 1,
    occurredAt: clock.now(),
    tenantId: tenant,
    workspaceId: workspace,
    correlationId: correlationId('summary-prisma-outbox-smoke'),
    causationId: causationId('summary-job:topic:2026-06-08'),
    payload: {
      summaryId: completedArtifact.toSnapshot().summaryId,
      topicId,
      summaryJobId: completedJob.toSnapshot().id,
    },
  });

  const outboxRecord = prisma.outboxEvents.get('00000000-0000-7000-8000-000000000901');
  assert(outboxRecord?.eventType === 'summary.ready', 'summary event publisher must persist event type');
  assert(outboxRecord.status === 'PENDING', 'summary outbox event must start pending');
  assert(outboxRecord.tenantId === tenant, 'summary outbox event must preserve tenant scope');
  assert(outboxRecord.workspaceId === workspace, 'summary outbox event must preserve workspace scope');

  console.log('Summary Prisma persistence smoke OK');
}

const makeCompletedArtifact = (summaryId: string): SummaryArtifact =>
  SummaryArtifact.create({
    schemaVersion: 'summary.artifact.v1',
    summaryId,
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    sourceWindow: {
      windowId: 'window-1',
      startedAt: new Date('2026-06-08T00:00:00.000Z'),
      endedAt: new Date('2026-06-08T01:00:00.000Z'),
      selectedFeedItemIds: ['feed-1'],
    },
    headline: 'Durable summary',
    executiveSummary: 'Durable summary body',
    keyPoints: [
      {
        claim: 'Durable summary claim',
        citationIds: ['citation-1'],
      },
    ],
    risksAndUnknowns: [
      {
        description: 'Limited beta evidence',
        citationIds: ['citation-1'],
      },
    ],
    sourceHighlights: ['Durable source highlight'],
    citationMap: [
      {
        citationId: 'citation-1',
        feedItemId: 'feed-1',
        sourceItemId: 'source-1',
        field: 'bodyPreview',
      },
    ],
    qualityFlags: [],
    confidence: {
      level: 'high',
      score: 0.91,
      rationale: 'Single controlled fixture with direct citation',
    },
    lineage: {
      promptVersion: 'summary.prompt.v1',
      schemaVersion: 'summary.artifact.v1',
      modelVersion: 'deterministic-local.v1',
      providerVersion: 'local',
      rulesVersion: 'summary.rules.v1',
      evalDatasetVersion: 'summary.eval.v1',
    },
    usage: {
      inputTokens: 120,
      outputTokens: 40,
      estimatedCostUsd: 0,
    },
  });

const makeNoSignalArtifact = (summaryId: string): SummaryArtifact =>
  SummaryArtifact.create({
    schemaVersion: 'summary.artifact.v1',
    summaryId,
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    sourceWindow: {
      windowId: 'window-2',
      startedAt: new Date('2026-06-08T02:00:00.000Z'),
      endedAt: new Date('2026-06-08T03:00:00.000Z'),
      selectedFeedItemIds: [],
    },
    headline: 'No reliable signal',
    executiveSummary: 'No reliable signal in the selected source window.',
    keyPoints: [],
    risksAndUnknowns: [
      {
        description: 'No evidence was selected',
        reason: 'insufficient_evidence',
      },
    ],
    sourceHighlights: [],
    citationMap: [],
    qualityFlags: ['no_signal'],
    confidence: {
      level: 'none',
      score: 0,
      rationale: 'No selected evidence',
    },
    lineage: {
      promptVersion: 'summary.prompt.v1',
      schemaVersion: 'summary.artifact.v1',
      modelVersion: 'deterministic-local.v1',
      providerVersion: 'local',
      rulesVersion: 'summary.rules.v1',
      evalDatasetVersion: 'summary.eval.v1',
    },
    usage: {
      inputTokens: 12,
      outputTokens: 12,
      estimatedCostUsd: 0,
    },
    noSignalReason: 'No selected evidence',
  });

class FakePrismaSummaryClient implements PrismaSummaryClient {
  private readonly jobs = new Map<string, PrismaSummaryJobRecord>();
  private readonly artifacts = new Map<string, PrismaSummaryArtifactRecord>();
  private readonly feedback = new Map<string, PrismaSummaryFeedbackRecord>();
  private readonly policies = new Map<string, PrismaSummaryPolicyRecord>();
  readonly outboxEvents = new Map<string, PrismaSummaryOutboxEventRecord>();

  readonly summaryJob: PrismaSummaryClient['summaryJob'] = {
    upsert: async (args) => {
      const existing = this.jobs.get(args.where.id);
      const record: PrismaSummaryJobRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        topicId: existing?.topicId ?? args.create.topicId,
        status: args.update.status,
        idempotencyKey: args.update.idempotencyKey,
        requestedAt: args.update.requestedAt,
        startedAt: args.update.startedAt ?? null,
        completedAt: args.update.completedAt ?? null,
        failedAt: args.update.failedAt ?? null,
        summaryArtifactId: args.update.summaryArtifactId ?? null,
        failureReason: args.update.failureReason ?? null,
        createdAt: existing?.createdAt ?? clock.now(),
        updatedAt: clock.now(),
      };
      this.jobs.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.jobs.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        record.workspaceId === args.where.workspaceId &&
        (args.where.id === undefined || record.id === args.where.id) &&
        (args.where.idempotencyKey === undefined || record.idempotencyKey === args.where.idempotencyKey)
      )) ?? null,
    findMany: async (args) =>
      [...this.jobs.values()]
        .filter((record) => (
          record.status === args.where.status &&
          (args.where.tenantId === undefined || record.tenantId === args.where.tenantId) &&
          (args.where.workspaceId === undefined || record.workspaceId === args.where.workspaceId)
        ))
        .sort((left, right) => {
          const requestedDiff = left.requestedAt.getTime() - right.requestedAt.getTime();

          return requestedDiff === 0 ? left.id.localeCompare(right.id) : requestedDiff;
        })
        .slice(0, args.take),
  };

  readonly summaryArtifact: PrismaSummaryClient['summaryArtifact'] = {
    upsert: async (args) => {
      const existing = this.artifacts.get(args.where.id);
      const record: PrismaSummaryArtifactRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        topicId: existing?.topicId ?? args.create.topicId,
        schemaVersion: existing?.schemaVersion ?? args.create.schemaVersion,
        status: args.update.status,
        modelVersion: args.update.modelVersion,
        promptVersion: args.update.promptVersion,
        headline: args.update.headline,
        summaryText: args.update.summaryText,
        artifactPayload: args.update.artifactPayload,
        citations: args.update.citations,
        qualitySignals: args.update.qualitySignals,
        createdAt: existing?.createdAt ?? clock.now(),
        updatedAt: clock.now(),
      };
      this.artifacts.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.artifacts.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        record.workspaceId === args.where.workspaceId &&
        record.id === args.where.id
      )) ?? null,
    findMany: async (args) =>
      this.filterArtifacts(args.where)
        .sort(compareArtifacts)
        .slice(args.skip, args.skip + args.take),
    count: async (args) => this.filterArtifacts(args.where).length,
  };

  readonly summaryFeedback: PrismaSummaryClient['summaryFeedback'] = {
    upsert: async (args) => {
      const key = `${args.where.tenantId_idempotencyKey.tenantId}:${args.where.tenantId_idempotencyKey.idempotencyKey}`;
      const existing = this.feedback.get(key);
      const record: PrismaSummaryFeedbackRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        summaryArtifactId: existing?.summaryArtifactId ?? args.create.summaryArtifactId,
        topicId: existing?.topicId ?? args.create.topicId,
        idempotencyKey: existing?.idempotencyKey ?? args.create.idempotencyKey,
        submittedBy: args.update.submittedBy,
        rating: args.update.rating,
        category: args.update.category,
        triageOwner: args.update.triageOwner,
        eligibleForEvalFixture: args.update.eligibleForEvalFixture,
        note: args.update.note,
        evidence: args.update.evidence,
        createdAt: existing?.createdAt ?? args.create.createdAt,
      };
      this.feedback.set(key, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.feedback.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        record.workspaceId === args.where.workspaceId &&
        record.idempotencyKey === args.where.idempotencyKey
      )) ?? null,
    findMany: async (args) =>
      this.filterFeedback(args.where)
        .sort(compareFeedback)
        .slice(args.skip, args.skip + args.take),
    count: async (args) => this.filterFeedback(args.where).length,
  };

  readonly summaryPolicy: PrismaSummaryClient['summaryPolicy'] = {
    upsert: async (args) => {
      const key = [
        args.where.tenantId_workspaceId_topicId.tenantId,
        args.where.tenantId_workspaceId_topicId.workspaceId,
        args.where.tenantId_workspaceId_topicId.topicId,
      ].join(':');
      const existing = this.policies.get(key);
      const record: PrismaSummaryPolicyRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        topicId: existing?.topicId ?? args.create.topicId,
        language: args.update.language,
        format: args.update.format,
        tone: args.update.tone,
        maxKeyPoints: args.update.maxKeyPoints,
        includeRisks: args.update.includeRisks,
        includeSourceHighlights: args.update.includeSourceHighlights,
        customInstructions: args.update.customInstructions,
        rulesVersion: args.update.rulesVersion,
        createdAt: existing?.createdAt ?? args.create.createdAt,
        updatedAt: args.update.updatedAt,
      };
      this.policies.set(key, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.policies.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        record.workspaceId === args.where.workspaceId &&
        record.topicId === args.where.topicId
      )) ?? null,
  };

  readonly outboxEvent: PrismaSummaryClient['outboxEvent'] = {
    create: async (args) => {
      const record: PrismaSummaryOutboxEventRecord = {
        id: args.data.id,
        tenantId: args.data.tenantId ?? null,
        workspaceId: args.data.workspaceId ?? null,
        eventType: args.data.eventType,
        schemaVersion: args.data.schemaVersion,
        payload: args.data.payload,
        status: 'PENDING',
        correlationId: args.data.correlationId,
        causationId: args.data.causationId ?? null,
        createdAt: clock.now(),
        publishedAt: null,
      };
      this.outboxEvents.set(record.id, record);

      return record;
    },
  };

  private filterArtifacts(where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly topicId?: string;
    readonly status?: { readonly in: readonly PrismaSummaryStatus[] };
  }): PrismaSummaryArtifactRecord[] {
    return [...this.artifacts.values()].filter((record) => (
      record.tenantId === where.tenantId &&
      record.workspaceId === where.workspaceId &&
      (where.topicId === undefined || record.topicId === where.topicId) &&
      (where.status === undefined || where.status.in.includes(record.status))
    ));
  }

  private filterFeedback(where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly summaryArtifactId?: string;
    readonly createdAt?: {
      readonly gte?: Date;
      readonly lte?: Date;
    };
  }): PrismaSummaryFeedbackRecord[] {
    return [...this.feedback.values()].filter((record) => (
      record.tenantId === where.tenantId &&
      record.workspaceId === where.workspaceId &&
      (where.summaryArtifactId === undefined || record.summaryArtifactId === where.summaryArtifactId) &&
      (where.createdAt?.gte === undefined || record.createdAt.getTime() >= where.createdAt.gte.getTime()) &&
      (where.createdAt?.lte === undefined || record.createdAt.getTime() <= where.createdAt.lte.getTime())
    ));
  }
}

const compareArtifacts = (left: PrismaSummaryArtifactRecord, right: PrismaSummaryArtifactRecord): number => {
  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.id.localeCompare(left.id);
};

const compareFeedback = (left: PrismaSummaryFeedbackRecord, right: PrismaSummaryFeedbackRecord): number => {
  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.id.localeCompare(left.id);
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const assertThrows = (operation: () => unknown, message: string): void => {
  try {
    operation();
  } catch {
    return;
  }

  throw new Error(message);
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
