import {
  FixedClock,
  type IdGenerator,
  type JsonObject,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { PrismaFeedItemReadRepository } from "../libs/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { PrismaFeedProjectionAdapter } from "../libs/feed/adapters/persistence/prisma/prisma-feed-projection.adapter";
import type {
  PrismaFeedClient,
  PrismaFeedSignalBaselineSampleRecord,
} from "../libs/feed/adapters/persistence/prisma/prisma-feed-client";
import type { PrismaFeedItemRecord } from "../libs/feed/adapters/persistence/prisma/prisma-feed-records";
import { resolveFeedPersistenceMode } from "../libs/feed/interfaces/rest/feed-provider-tokens";
import { ScanAttempt, SourceItem } from "../libs/ingestion/domain";
import { PrismaScanAttemptRepository } from "../libs/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository";
import { PrismaScanCursorRepository } from "../libs/ingestion/adapters/persistence/prisma/prisma-scan-cursor.repository";
import { PrismaSourceItemRepository } from "../libs/ingestion/adapters/persistence/prisma/prisma-source-item.repository";
import type { PrismaIngestionClient } from "../libs/ingestion/adapters/persistence/prisma/prisma-ingestion-client";
import type { SavedSourceItemRef } from "../libs/ingestion/ports";
import type {
  PrismaCursorCheckpointRecord,
  PrismaScanAttemptRecord,
  PrismaScanFailureQueueEntryRecord,
  PrismaScanLeaseEntryRecord,
  PrismaSourceItemRecord,
} from "../libs/ingestion/adapters/persistence/prisma/prisma-ingestion-records";
import { PrismaScanFailureQueueAdapter } from "../libs/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter";
import { PrismaScanLeaseAdapter } from "../libs/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter";
import { resolveIngestionSupportPersistenceMode } from "../libs/ingestion/interfaces/rest/ingestion-provider-tokens";
import { resolveIngestionWorkerPersistenceMode } from "../apps/ingestion-worker/src/ingestion-worker-provider-tokens";
import { updateFakeSourceItem } from "./support/update-fake-source-item";

const clock = new FixedClock(new Date("2026-06-07T00:00:00.000Z"));
const tenant = tenantId("00000000-0000-7000-8000-000000000101");
const workspace = workspaceId("00000000-0000-7000-8000-000000000102");
const sourceBindingId = "00000000-0000-7000-8000-000000000103";
const interestId = "00000000-0000-7000-8000-000000000104";
const projectionSnapshots = (providerKey: string) => ({
  interestQuerySnapshot: {
    interestId,
    query: "durable feed quality",
  },
  sourceBindingSnapshot: {
    sourceBindingId,
    providerKey,
    sourceQuery: {
      mode: "search" as const,
      query: `durable feed ${providerKey}`,
    },
  },
  workspaceScopeSnapshot: {
    tenantId: tenant,
    workspaceId: workspace,
  },
});

async function main(): Promise<void> {
  assert(
    resolveFeedPersistenceMode({}) === "in-memory",
    "feed persistence must default to in-memory",
  );
  assertThrows(
    () => resolveFeedPersistenceMode({ FEED_PERSISTENCE: "prisma" }),
    "FEED_PERSISTENCE=prisma must require DATABASE_URL",
  );
  assert(
    resolveFeedPersistenceMode({
      FEED_PERSISTENCE: "prisma",
      DATABASE_URL: "postgresql://example.test/social-monitor",
    }) === "prisma",
    "feed persistence must accept explicit Prisma mode with DATABASE_URL",
  );
  assert(
    resolveIngestionWorkerPersistenceMode({}) === "in-memory",
    "ingestion worker persistence must default to in-memory",
  );
  assertThrows(
    () =>
      resolveIngestionWorkerPersistenceMode({
        INGESTION_WORKER_PERSISTENCE: "prisma",
      }),
    "INGESTION_WORKER_PERSISTENCE=prisma must require DATABASE_URL",
  );
  assert(
    resolveIngestionWorkerPersistenceMode({
      INGESTION_WORKER_PERSISTENCE: "prisma",
      DATABASE_URL: "postgresql://example.test/social-monitor",
    }) === "prisma",
    "ingestion worker persistence must accept explicit Prisma mode with DATABASE_URL",
  );
  assert(
    resolveIngestionSupportPersistenceMode({}) === "in-memory",
    "ingestion support persistence must default to in-memory",
  );
  assertThrows(
    () =>
      resolveIngestionSupportPersistenceMode({
        INGESTION_SUPPORT_PERSISTENCE: "prisma",
      }),
    "INGESTION_SUPPORT_PERSISTENCE=prisma must require DATABASE_URL",
  );
  assert(
    resolveIngestionSupportPersistenceMode({
      INGESTION_SUPPORT_PERSISTENCE: "prisma",
      DATABASE_URL: "postgresql://example.test/social-monitor",
    }) === "prisma",
    "ingestion support persistence must accept explicit Prisma mode with DATABASE_URL",
  );

  const prisma = new FakePrismaIngestionFeedClient();
  const ids = new SequenceIdGenerator([
    "00000000-0000-7000-8000-000000000201",
    "00000000-0000-7000-8000-000000000202",
    "00000000-0000-7000-8000-000000000203",
    "00000000-0000-7000-8000-000000000204",
    "00000000-0000-7000-8000-000000000205",
    "00000000-0000-7000-8000-000000000206",
    "00000000-0000-7000-8000-000000000207",
    "00000000-0000-7000-8000-000000000208",
    "00000000-0000-7000-8000-000000000209",
    "00000000-0000-7000-8000-000000000210",
  ]);
  const sourceItems = new PrismaSourceItemRepository(prisma);
  const cursors = new PrismaScanCursorRepository(prisma, ids);
  const feedProjection = new PrismaFeedProjectionAdapter(prisma, ids);
  const feedRead = new PrismaFeedItemReadRepository(prisma);
  const failureQueue = new PrismaScanFailureQueueAdapter(
    prisma,
    new InMemoryMetricsRecorder(),
    ids,
  );
  const scanAttempts = new PrismaScanAttemptRepository(prisma);
  const scanLeases = new PrismaScanLeaseAdapter(prisma, ids);
  const firstItem = makeSourceItem({
    id: "00000000-0000-7000-8000-000000000301",
    externalId: "story-1",
    canonicalUrl:
      "https://Example.test/story?utm_source=email&b=2&a=1#comments",
    title: "Durable Feed",
  });
  const duplicateProviderItem = makeSourceItem({
    id: "00000000-0000-7000-8000-000000000302",
    externalId: "story-1",
    canonicalUrl: "https://example.test/story?a=1&b=2",
    title: "Duplicate Durable Feed",
  });

  const saveResult = await sourceItems.saveBatch({
    tenantId: tenant,
    workspaceId: workspace,
    providerKey: "fake-source",
    items: [firstItem, duplicateProviderItem],
  });
  assert(
    saveResult.inserted === 1,
    "source item repository must insert first provider item",
  );
  assert(
    saveResult.contentUpdated === 1 && saveResult.skippedDuplicates === 0,
    "source item repository must update changed provider content",
  );
  assert(
    saveResult.items.map((item) => item.sourceItemId).join(",") ===
      [
        "00000000-0000-7000-8000-000000000301",
        "00000000-0000-7000-8000-000000000301",
      ].join(","),
    "source item repository must return persisted source ids for duplicates",
  );

  await cursors.save({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId,
    cursor: "cursor-1",
    committedAt: clock.now(),
  });
  const cursor = await cursors.findBySourceBinding({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId,
  });
  assert(
    cursor?.cursor === "cursor-1",
    "scan cursor must round-trip through Prisma repository",
  );

  const projectionResult = await feedProjection.project({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    sourceBindingId,
    providerKey: "fake-source",
    snapshots: projectionSnapshots("fake-source"),
    sourceItems: sourceItemsWithPersistedIds(
      [firstItem, duplicateProviderItem],
      saveResult.items,
    ),
  });
  assert(
    projectionResult.projected === 2,
    "feed projection must process every source item command",
  );

  const list = await feedRead.list({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    limit: 10,
  });
  assert(
    list.items.length === 1,
    "feed read repository must dedupe normalized canonical URLs per topic",
  );
  const feedItem = list.items[0];
  assert(
    feedItem !== undefined,
    "feed read repository must return the projected feed item",
  );
  assert(
    feedItem.toSnapshot().title === "Duplicate Durable Feed",
    "feed upsert must refresh duplicate feed content",
  );
  assert(
    feedItem.toSnapshot().providerKey === "fake-source",
    "feed projection must persist provider key",
  );

  const search = await feedRead.list({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    limit: 10,
    searchQuery: "duplicate durable",
  });
  assert(
    search.items.length === 1,
    "feed read repository must support search filtering",
  );

  const found = await feedRead.findById({
    tenantId: tenant,
    workspaceId: workspace,
    feedItemId: feedItem.toSnapshot().id,
  });
  assert(
    found?.toSnapshot().canonicalUrl === "https://example.test/story?a=1&b=2",
    "feed item findById must rehydrate item",
  );

  const articleFromReddit = makeSourceItem({
    id: "00000000-0000-7000-8000-000000000303",
    externalId: "reddit-article-1",
    canonicalUrl: "https://www.reddit.com/r/OpenAI/comments/article_1/demo/",
    title: "Article via Reddit",
    metadata: {
      articleContent: {
        status: "enriched",
        semanticFingerprint: "feedfacecafebeef",
        contentHash: "content-hash-1",
      },
    },
  });
  const articleFromRss = makeSourceItem({
    id: "00000000-0000-7000-8000-000000000304",
    externalId: "rss-article-1",
    canonicalUrl: "https://example.test/same-article?utm_source=rss",
    title: "Article via RSS",
    body: `Article intro. ${"Article evidence text should be retained for summary context. ".repeat(8)}semantic-tail-marker`,
    metadata: {
      articleContent: {
        status: "enriched",
        semanticFingerprint: "feedfacecafebeef",
        contentHash: "content-hash-1",
      },
    },
  });
  const articleSaveResult = await sourceItems.saveBatch({
    tenantId: tenant,
    workspaceId: workspace,
    providerKey: "article-source",
    items: [articleFromReddit, articleFromRss],
  });
  await feedProjection.project({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    sourceBindingId,
    providerKey: "article-source",
    snapshots: projectionSnapshots("article-source"),
    sourceItems: sourceItemsWithPersistedIds(
      [articleFromReddit, articleFromRss],
      articleSaveResult.items,
    ),
  });
  const articleList = await feedRead.list({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    limit: 10,
    searchQuery: "article via",
  });
  assert(
    articleList.items.length === 1,
    "feed projection must dedupe enriched articles by semantic fingerprint",
  );
  assert(
    articleList.items[0]?.toSnapshot().title === "Article via RSS",
    "article fingerprint upsert must refresh latest feed content",
  );
  assert(
    articleList.items[0]
      ?.toSnapshot()
      .bodyPreview.includes("semantic-tail-marker") === true,
    "feed projection must retain enriched article evidence text beyond short preview length",
  );

  await failureQueue.enqueueRetry({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: "00000000-0000-7000-8000-000000000401",
    interestId,
    sourceBindingId,
    scanPolicyId: "00000000-0000-7000-8000-000000000402",
    providerKey: "fake-source",
    sourceQuery: {
      mode: "search",
      query: "durable feed",
    },
    correlationId: "corr-1",
    causationId: "cause-1",
    attemptNumber: 1,
    retryBudget: 2,
    nextAttemptNumber: 2,
    failureReason: "temporary provider failure",
  });
  await failureQueue.deadLetter({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: "00000000-0000-7000-8000-000000000403",
    interestId,
    sourceBindingId,
    scanPolicyId: "00000000-0000-7000-8000-000000000404",
    providerKey: "fake-source",
    sourceQuery: {
      mode: "search",
      query: "durable feed",
    },
    correlationId: "corr-2",
    causationId: "cause-2",
    attemptNumber: 2,
    retryBudget: 2,
    failureReason: "provider exhausted retry budget",
  });
  const deadLetters = await failureQueue.listDeadLetters({
    tenantId: tenant,
    workspaceId: workspace,
    limit: 10,
  });
  assert(
    deadLetters.length === 1,
    "scan failure queue must list durable dead letters",
  );
  const deadLetter = deadLetters[0];
  assert(
    deadLetter !== undefined,
    "scan failure queue must return dead letter command",
  );
  assert(
    deadLetter.failureReason === "provider exhausted retry budget",
    "scan failure queue dead letter reason must round-trip",
  );

  const startedAttempt = ScanAttempt.start({
    scanJobId: "00000000-0000-7000-8000-000000000405",
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId,
    startedAt: clock.now(),
  });
  await scanAttempts.save(startedAttempt);
  const runningAttempt = await scanAttempts.findByScanJob({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: startedAttempt.toSnapshot().scanJobId,
  });
  assert(
    runningAttempt?.toSnapshot().status === "running",
    "scan attempt must persist running state",
  );

  await scanAttempts.save(
    startedAttempt.succeed({
      finishedAt: new Date("2026-06-07T00:00:05.000Z"),
      fetched: 2,
      inserted: 1,
      skippedDuplicates: 1,
      projected: 2,
    }),
  );
  const completedAttempt = await scanAttempts.findByScanJob({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: startedAttempt.toSnapshot().scanJobId,
  });
  const completedAttemptSnapshot = completedAttempt?.toSnapshot();
  assert(
    completedAttemptSnapshot?.status === "succeeded",
    "scan attempt must persist terminal state",
  );
  assert(
    completedAttemptSnapshot.inserted === 1,
    "scan attempt counters must round-trip",
  );

  const lease = await scanLeases.acquire({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: "00000000-0000-7000-8000-000000000406",
    workerId: "worker-1",
    leasedAt: clock.now(),
    ttlSeconds: 60,
  });
  assert(
    lease !== null,
    "scan lease must be acquired when no active lease exists",
  );

  const contestedLease = await scanLeases.acquire({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: lease.scanJobId,
    workerId: "worker-2",
    leasedAt: new Date("2026-06-07T00:00:01.000Z"),
    ttlSeconds: 60,
  });
  assert(
    contestedLease === null,
    "scan lease must reject competing workers before expiry",
  );

  await scanLeases.release(lease);
  const reacquiredLease = await scanLeases.acquire({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: lease.scanJobId,
    workerId: "worker-2",
    leasedAt: new Date("2026-06-07T00:00:02.000Z"),
    ttlSeconds: 60,
  });
  assert(reacquiredLease !== null, "scan lease must be reusable after release");
  assert(
    reacquiredLease.workerId === "worker-2",
    "scan lease release must remove only the fenced lease",
  );

  console.log("Ingestion/feed Prisma persistence smoke OK");
}

const makeSourceItem = (params: {
  readonly id: string;
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly body?: string;
  readonly metadata?: JsonObject;
}): SourceItem =>
  SourceItem.ingest({
    id: params.id,
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId,
    externalId: params.externalId,
    canonicalUrl: params.canonicalUrl,
    title: params.title,
    body: params.body ?? `${params.title} body`,
    authorHandle: "author",
    publishedAt: new Date("2026-06-07T00:00:00.000Z"),
    ingestedAt: clock.now(),
    metadata: params.metadata,
  });

const sourceItemsWithPersistedIds = (
  items: readonly SourceItem[],
  refs: readonly SavedSourceItemRef[],
): readonly SourceItem[] => {
  const persistedIdByExternalId = new Map(
    refs.map((ref) => [ref.externalId, ref.sourceItemId]),
  );

  return items.map((item) => {
    const snapshot = item.toSnapshot();
    const sourceItemId = persistedIdByExternalId.get(snapshot.externalId);

    if (sourceItemId === undefined) {
      throw new Error(
        `Missing persisted source item ref for ${snapshot.externalId}`,
      );
    }

    return SourceItem.rehydrate({
      ...snapshot,
      id: sourceItemId,
    });
  });
};

class SequenceIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  generate(): string {
    const value = this.values[this.index];

    if (value === undefined) {
      throw new Error("SequenceIdGenerator exhausted");
    }

    this.index += 1;

    return value;
  }
}

class FakePrismaIngestionFeedClient
  implements PrismaIngestionClient, PrismaFeedClient
{
  private readonly sourceItems = new Map<string, PrismaSourceItemRecord>();
  private readonly cursors = new Map<string, PrismaCursorCheckpointRecord>();
  private readonly feedItems = new Map<string, PrismaFeedItemRecord>();
  private readonly feedSignalBaselineSamples = new Map<
    string,
    PrismaFeedSignalBaselineSampleRecord
  >();
  private readonly failureEntries: PrismaScanFailureQueueEntryRecord[] = [];
  private readonly attempts = new Map<string, PrismaScanAttemptRecord>();
  private readonly leases = new Map<string, PrismaScanLeaseEntryRecord>();

  readonly sourceItem: PrismaIngestionClient["sourceItem"] = {
    findFirst: async (args) =>
      [...this.sourceItems.values()].find(
        (record) =>
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          record.providerKey === args.where.providerKey &&
          record.providerItemId === args.where.providerItemId,
      ) ?? null,
    create: async (args) => {
      const existing = [...this.sourceItems.values()].find(
        (record) =>
          record.tenantId === args.data.tenantId &&
          record.workspaceId === args.data.workspaceId &&
          record.providerKey === args.data.providerKey &&
          record.providerItemId === args.data.providerItemId,
      );
      if (existing !== undefined) {
        throw Object.assign(
          new Error("Unique source item constraint violation"),
          { code: "P2002" },
        );
      }

      const record: PrismaSourceItemRecord = {
        ...args.data,
        authorHandle: args.data.authorHandle ?? null,
        createdAt: clock.now(),
      };
      this.sourceItems.set(record.id, record);

      return record;
    },
    update: async (args) => updateFakeSourceItem(this.sourceItems, args),
  };

  readonly cursorCheckpoint: PrismaIngestionClient["cursorCheckpoint"] = {
    upsert: async (args) => {
      const key = `${args.where.tenantId_sourceBindingId.tenantId}:${args.where.tenantId_sourceBindingId.sourceBindingId}`;
      const existing = this.cursors.get(key);
      const record: PrismaCursorCheckpointRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        sourceBindingId:
          existing?.sourceBindingId ?? args.create.sourceBindingId,
        cursorPayload:
          existing === undefined
            ? args.create.cursorPayload
            : args.update.cursorPayload,
        updatedAt: clock.now(),
      };
      this.cursors.set(key, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.cursors.values()].find(
        (record) =>
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          record.sourceBindingId === args.where.sourceBindingId,
      ) ?? null,
  };

  readonly scanFailureQueueEntry: PrismaIngestionClient["scanFailureQueueEntry"] =
    {
      create: async (args) => {
        const record: PrismaScanFailureQueueEntryRecord = {
          ...args.data,
          nextAttemptNumber: args.data.nextAttemptNumber ?? null,
          createdAt: clock.now(),
        };
        this.failureEntries.push(record);

        return record;
      },
      findMany: async (args) =>
        this.failureEntries
          .filter(
            (record) =>
              (args.where.tenantId === undefined ||
                record.tenantId === args.where.tenantId) &&
              (args.where.workspaceId === undefined ||
                record.workspaceId === args.where.workspaceId) &&
              record.status === args.where.status,
          )
          .sort((left, right) =>
            args.orderBy.createdAt === "asc"
              ? left.createdAt.getTime() - right.createdAt.getTime()
              : right.createdAt.getTime() - left.createdAt.getTime(),
          )
          .slice(0, args.take),
      deleteMany: async (args) => {
        const ids = new Set(args.where.id.in);
        const before = this.failureEntries.length;

        for (
          let index = this.failureEntries.length - 1;
          index >= 0;
          index -= 1
        ) {
          if (ids.has(this.failureEntries[index]?.id ?? "")) {
            this.failureEntries.splice(index, 1);
          }
        }

        return { count: before - this.failureEntries.length };
      },
      count: async (args) =>
        this.failureEntries.filter(
          (record) =>
            record.tenantId === args.where.tenantId &&
            record.workspaceId === args.where.workspaceId &&
            record.status === args.where.status,
        ).length,
    };

  readonly scanAttempt: PrismaIngestionClient["scanAttempt"] = {
    upsert: async (args) => {
      const existing = this.attempts.get(args.where.scanJobId);
      const record: PrismaScanAttemptRecord = {
        scanJobId: existing?.scanJobId ?? args.create.scanJobId,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        sourceBindingId:
          existing?.sourceBindingId ?? args.create.sourceBindingId,
        status: args.update.status,
        startedAt: args.update.startedAt,
        finishedAt: args.update.finishedAt ?? null,
        fetched: args.update.fetched,
        inserted: args.update.inserted,
        skippedDuplicates: args.update.skippedDuplicates,
        projected: args.update.projected,
        failureReason: args.update.failureReason ?? null,
      };
      this.attempts.set(record.scanJobId, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.attempts.values()].find(
        (record) =>
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          record.scanJobId === args.where.scanJobId,
      ) ?? null,
  };

  readonly scanLeaseEntry: PrismaIngestionClient["scanLeaseEntry"] = {
    deleteMany: async (args) => {
      let count = 0;

      for (const [key, record] of this.leases.entries()) {
        if (!matchesLeaseWhere(record, args.where)) {
          continue;
        }

        this.leases.delete(key);
        count += 1;
      }

      return { count };
    },
    create: async (args) => {
      const key = leaseKey(args.data);

      if (this.leases.has(key)) {
        throw Object.assign(
          new Error("Unique scan lease constraint violation"),
          { code: "P2002" },
        );
      }

      const record: PrismaScanLeaseEntryRecord = { ...args.data };
      this.leases.set(key, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.leases.values()].find(
        (record) =>
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          record.scanJobId === args.where.scanJobId,
      ) ?? null,
  };

  readonly gitHubRepositoryTrendCandidate: PrismaIngestionClient["gitHubRepositoryTrendCandidate"] =
    {
      upsert: async (args) => args.create,
    };

  readonly gitHubRepositoryTrendSnapshot: PrismaIngestionClient["gitHubRepositoryTrendSnapshot"] =
    {
      upsert: async (args) => args.create,
    };

  readonly gitHubRepositoryTrendResult: PrismaIngestionClient["gitHubRepositoryTrendResult"] =
    {
      upsert: async (args) => args.create,
    };

  readonly feedItem: PrismaFeedClient["feedItem"] = {
    upsert: async (args) => {
      const requestedSourceItemId =
        this.feedItems.get(
          [
            args.where.tenantId_interestId_dedupeKey.tenantId,
            args.where.tenantId_interestId_dedupeKey.interestId,
            args.where.tenantId_interestId_dedupeKey.dedupeKey,
          ].join(":"),
        ) === undefined
          ? args.create.sourceItemId
          : args.update.sourceItemId;
      if (!this.sourceItems.has(requestedSourceItemId)) {
        throw new Error(
          `Feed item sourceItemId ${requestedSourceItemId} does not reference a source item`,
        );
      }

      const key = [
        args.where.tenantId_interestId_dedupeKey.tenantId,
        args.where.tenantId_interestId_dedupeKey.interestId,
        args.where.tenantId_interestId_dedupeKey.dedupeKey,
      ].join(":");
      const existing = this.feedItems.get(key);
      const record: PrismaFeedItemRecord =
        existing === undefined
          ? {
              id: args.create.id,
              tenantId: args.create.tenantId,
              workspaceId: args.create.workspaceId,
              interestId: args.create.interestId,
              sourceItemId: args.create.sourceItemId,
              sourceBindingId: args.create.sourceBindingId,
              providerKey: args.create.providerKey,
              dedupeKey: args.create.dedupeKey,
              canonicalUrl: args.create.canonicalUrl,
              title: args.create.title,
              bodyPreview: args.create.bodyPreview,
              authorHandle: args.create.authorHandle ?? null,
              publishedAt: args.create.publishedAt,
              observedAt: args.create.observedAt,
              providerMetadata: args.create.providerMetadata ?? null,
              status: args.create.status,
              createdAt: clock.now(),
            }
          : {
              ...existing,
              sourceItemId: args.update.sourceItemId,
              sourceBindingId: args.update.sourceBindingId,
              providerKey: args.update.providerKey,
              canonicalUrl: args.update.canonicalUrl,
              title: args.update.title,
              bodyPreview: args.update.bodyPreview,
              authorHandle: args.update.authorHandle ?? null,
              publishedAt: args.update.publishedAt,
              observedAt: existing.observedAt,
              providerMetadata:
                args.update.providerMetadata === undefined
                  ? existing.providerMetadata
                  : (args.update.providerMetadata ?? null),
              status: existing.status,
            };
      this.feedItems.set(key, record);

      return record;
    },
    findMany: async (args) =>
      this.filterFeedItems(args.where)
        .sort(compareFeedRecords)
        .slice(args.skip, args.skip + args.take),
    count: async (args) => this.filterFeedItems(args.where).length,
    findFirst: async (args) =>
      this.filterFeedItems(args.where).find(
        (record) => record.id === args.where.id,
      ) ?? null,
  };

  readonly feedSignalBaselineSample: PrismaFeedClient["feedSignalBaselineSample"] =
    {
      upsert: async (args) => {
        const key = [
          args.where.tenantId_workspaceId_feedItemId.tenantId,
          args.where.tenantId_workspaceId_feedItemId.workspaceId,
          args.where.tenantId_workspaceId_feedItemId.feedItemId,
        ].join(":");
        const existing = this.feedSignalBaselineSamples.get(key);
        const record: PrismaFeedSignalBaselineSampleRecord = {
          id: existing?.id ?? args.create.id,
          tenantId: existing?.tenantId ?? args.create.tenantId,
          workspaceId: existing?.workspaceId ?? args.create.workspaceId,
          interestId: args.update.interestId,
          feedItemId: existing?.feedItemId ?? args.create.feedItemId,
          providerKey: args.update.providerKey,
          sourceKey: args.update.sourceKey,
          contentType: args.update.contentType,
          strength: args.update.strength,
          publishedAt: args.update.publishedAt,
          observedAt: args.update.observedAt,
        };
        this.feedSignalBaselineSamples.set(key, record);

        return record;
      },
      findMany: async (args) =>
        [...this.feedSignalBaselineSamples.values()]
          .filter(
            (record) =>
              record.tenantId === args.where.tenantId &&
              record.workspaceId === args.where.workspaceId &&
              (args.where.interestId === undefined ||
                record.interestId === args.where.interestId) &&
              record.observedAt.getTime() >
                args.where.observedAt.gt.getTime() &&
              matchesFeedSignalBaselineCohortFilters(
                record,
                args.where.OR ?? [],
              ),
          )
          .sort(
            (left, right) =>
              right.observedAt.getTime() - left.observedAt.getTime() ||
              right.feedItemId.localeCompare(left.feedItemId),
          )
          .slice(0, args.take),
      deleteMany: async (args) => {
        const key = [
          args.where.tenantId,
          args.where.workspaceId,
          args.where.feedItemId,
        ].join(":");
        const existed = this.feedSignalBaselineSamples.delete(key);

        return { count: existed ? 1 : 0 };
      },
    };

  private filterFeedItems(where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly status: "VISIBLE";
    readonly interestId?: string;
    readonly observedAt?: { readonly gt?: Date; readonly lt?: Date };
    readonly providerKey?: string;
  }): PrismaFeedItemRecord[] {
    return [...this.feedItems.values()].filter(
      (record) =>
        record.tenantId === where.tenantId &&
        record.workspaceId === where.workspaceId &&
        record.status === where.status &&
        (where.interestId === undefined ||
          record.interestId === where.interestId) &&
        (where.providerKey === undefined ||
          record.providerKey === where.providerKey) &&
        (where.observedAt?.gt === undefined ||
          record.observedAt.getTime() > where.observedAt.gt.getTime()) &&
        (where.observedAt?.lt === undefined ||
          record.observedAt.getTime() < where.observedAt.lt.getTime()),
    );
  }
}

const matchesFeedSignalBaselineCohortFilters = (
  record: PrismaFeedSignalBaselineSampleRecord,
  filters: NonNullable<
    Parameters<
      PrismaFeedClient["feedSignalBaselineSample"]["findMany"]
    >[0]["where"]["OR"]
  >,
): boolean =>
  filters.length === 0 ||
  filters.some(
    (filter) =>
      record.providerKey === filter.providerKey &&
      record.sourceKey === filter.sourceKey &&
      record.contentType === filter.contentType,
  );

const leaseKey = (record: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scanJobId: string;
}): string => [record.tenantId, record.workspaceId, record.scanJobId].join(":");

const matchesLeaseWhere = (
  record: PrismaScanLeaseEntryRecord,
  where: Parameters<
    PrismaIngestionClient["scanLeaseEntry"]["deleteMany"]
  >[0]["where"],
): boolean => {
  const matchesBase =
    record.tenantId === where.tenantId &&
    record.workspaceId === where.workspaceId &&
    record.scanJobId === where.scanJobId;

  if (!matchesBase) {
    return false;
  }

  if (
    where.expiresAt !== undefined &&
    record.expiresAt.getTime() > where.expiresAt.lte.getTime()
  ) {
    return false;
  }

  if (
    where.fencingToken !== undefined &&
    record.fencingToken !== where.fencingToken
  ) {
    return false;
  }

  return (
    where.OR === undefined ||
    where.OR.some((condition) => matchesLeaseOrCondition(record, condition))
  );
};

const matchesLeaseOrCondition = (
  record: PrismaScanLeaseEntryRecord,
  condition: NonNullable<
    Parameters<
      PrismaIngestionClient["scanLeaseEntry"]["deleteMany"]
    >[0]["where"]["OR"]
  >[number],
): boolean => {
  if ("expiresAt" in condition) {
    return record.expiresAt.getTime() <= condition.expiresAt.lte.getTime();
  }

  return record.fencingToken === condition.fencingToken;
};

const compareFeedRecords = (
  left: PrismaFeedItemRecord,
  right: PrismaFeedItemRecord,
): number => {
  const publishedDiff =
    right.publishedAt.getTime() - left.publishedAt.getTime();

  if (publishedDiff !== 0) {
    return publishedDiff;
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
