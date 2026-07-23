import {
  tenantId,
  workspaceId,
  type IdGenerator,
} from "@social-monitor/shared-kernel";

import type { ScanAttempt, SourceItem } from "../../domain";
import {
  SourceFetchError,
  type ConversationProjectionPort,
  type EnrichSourceItemsCommand,
  type EnrichSourceItemsResult,
  type FeedProjectionPort,
  type FetchSourceItemsCommand,
  type FetchSourceItemsResult,
  type ProjectConversationUnitsCommand,
  type ProjectConversationUnitsResult,
  type ProjectFeedItemsCommand,
  type ProjectFeedItemsResult,
  type SavedSourceItemRef,
  type SaveSourceItemsCommand,
  type SaveSourceItemsResult,
  type ScanAttemptRepositoryPort,
  type ScanCursorRepositoryPort,
  type ScanExecutionReporterPort,
  type ScanFailureQueuePort,
  type ScanLease,
  type ScanLeasePort,
  type SourceFetcherPort,
  type SourceItemEnrichmentPort,
  type SourceItemRepositoryPort,
} from "../../ports";
import type { ExecuteScanCommand } from "./execute-scan.command";

export const fixtureSecret = ["source", "secret"].join("-");
const authorizationScheme = ["Bear", "er"].join("");

export const makeExecuteScanCommand = (
  overrides: Partial<ExecuteScanCommand> = {},
): ExecuteScanCommand => ({
  tenantId: tenantId("tenant-1"),
  workspaceId: workspaceId("workspace-1"),
  scanJobId: "scan-job-1",
  interestId: "topic-1",
  sourceBindingId: "source-binding-1",
  scanPolicyId: "scan-policy-1",
  providerKey: "fake-source",
  sourceQuery: { mode: "search", query: "monitoring" },
  correlationId: "correlation-1",
  causationId: "causation-1",
  ...overrides,
});

export class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `source-item-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

export class FixedSourceFetcher implements SourceFetcherPort {
  readonly calls: FetchSourceItemsCommand[] = [];

  constructor(private readonly warnings: readonly string[] = []) {}

  async fetch(
    command: FetchSourceItemsCommand,
  ): Promise<FetchSourceItemsResult> {
    this.calls.push(command);

    return {
      items: [
        {
          externalId: "external-1",
          canonicalUrl: "https://example.test/external-1",
          title: "External 1",
          body: "Body 1",
          authorHandle: "author",
          publishedAt: new Date("2026-06-05T00:00:00.000Z"),
        },
        {
          externalId: "external-2",
          canonicalUrl: "https://example.test/external-2",
          title: "External 2",
          body: "Body 2",
          authorHandle: "author",
          publishedAt: new Date("2026-06-05T00:01:00.000Z"),
        },
      ],
      nextCursor: "cursor-after-scan",
      warnings: this.warnings,
    };
  }
}

export class ConversationSourceFetcher implements SourceFetcherPort {
  async fetch(
    command: FetchSourceItemsCommand,
  ): Promise<FetchSourceItemsResult> {
    void command;

    return {
      items: [
        {
          externalId: "reddit:t3_post_1",
          canonicalUrl: "https://reddit.test/r/topic/comments/post_1",
          title: "Root Reddit post",
          body: "Root post body",
          authorHandle: "post-author",
          publishedAt: new Date("2026-06-05T00:00:00.000Z"),
          metadata: {
            kind: "reddit_post",
            subreddit: "topic",
            score: 42,
          },
        },
      ],
      conversationUnits: [
        {
          rootExternalId: "reddit:t3_post_1",
          rootProviderItemId: "t3_post_1",
          providerUnitId: "t1_comment_1",
          canonicalUrl:
            "https://reddit.test/r/topic/comments/post_1/_/comment_1",
          body: "High-signal comment body",
          authorHandle: "comment-author",
          publishedAt: new Date("2026-06-05T00:05:00.000Z"),
          threadExternalId: "t3_post_1",
          depth: 0,
          role: "top_level_comment",
          metadata: {
            kind: "reddit_comment",
            subreddit: "topic",
            score: 25,
            replies: 2,
            depth: 0,
            role: "top_level_comment",
          },
        },
      ],
    };
  }
}

export class SensitiveSourceFetcher implements SourceFetcherPort {
  async fetch(): Promise<FetchSourceItemsResult> {
    return {
      items: [
        {
          externalId: `external-1?access_token=${fixtureSecret}`,
          canonicalUrl: `https://user:pass@example.test/source?access_token=${fixtureSecret}`,
          title: `Launch notes client_secret=${fixtureSecret}`,
          body: `Body includes Authorization ${authorizationScheme} ${fixtureSecret} and private_key=${fixtureSecret}.`,
          authorHandle: `${authorizationScheme} ${fixtureSecret}`,
          publishedAt: new Date("2026-06-05T00:00:00.000Z"),
          metadata: {
            accessToken: fixtureSecret,
            nested: {
              url: "https://user:pass@example.test/source",
            },
          },
        },
      ],
      nextCursor: "cursor-after-sensitive-scan",
    };
  }
}

export class FailingSourceFetcher implements SourceFetcherPort {
  async fetch(): Promise<FetchSourceItemsResult> {
    throw new Error("Provider unavailable");
  }
}

export class ClassifiedFailingSourceFetcher implements SourceFetcherPort {
  async fetch(): Promise<FetchSourceItemsResult> {
    throw new SourceFetchError({
      providerKey: "reddit",
      kind: "auth_failed",
      retryable: false,
      message: "Reddit OAuth token expired",
    });
  }
}

export class RateLimitedSourceFetcher implements SourceFetcherPort {
  async fetch(): Promise<FetchSourceItemsResult> {
    throw new SourceFetchError({
      providerKey: "x-twitter",
      kind: "rate_limited",
      retryable: true,
      retryAfterMs: 900_000,
      rateLimitResetAt: new Date("2026-06-05T12:15:00.000Z"),
      message: "X collector rate limit reached",
    });
  }
}

export class FakeSourceItemRepository implements SourceItemRepositoryPort {
  private readonly itemsByKey = new Map<string, SourceItem>();
  async saveBatch(
    command: SaveSourceItemsCommand,
  ): Promise<SaveSourceItemsResult> {
    let inserted = 0;
    let skippedDuplicates = 0;
    const savedItems: SavedSourceItemRef[] = [];

    for (const item of command.items) {
      const snapshot = item.toSnapshot();
      const key = `${command.tenantId}:${command.workspaceId}:${snapshot.sourceBindingId}:${snapshot.externalId}`;
      const existing = this.itemsByKey.get(key);
      if (existing !== undefined) {
        skippedDuplicates += 1;
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: existing.toSnapshot().id,
          persistedItem: existing,
          inserted: false,
          mutationKind: "unchanged",
        });
        continue;
      }
      this.itemsByKey.set(key, item);
      inserted += 1;
      savedItems.push({
        externalId: snapshot.externalId,
        sourceItemId: snapshot.id,
        persistedItem: item,
        inserted: true,
        mutationKind: "inserted",
      });
    }

    return { inserted, contentUpdated: 0, skippedDuplicates, items: savedItems };
  }

  all(): readonly SourceItem[] {
    return [...this.itemsByKey.values()];
  }
}

export class FakeFeedProjection implements FeedProjectionPort {
  readonly commands: ProjectFeedItemsCommand[] = [];

  async project(
    command: ProjectFeedItemsCommand,
  ): Promise<ProjectFeedItemsResult> {
    this.commands.push(command);
    return {
      projected: command.sourceItems.length,
      projectedItems: command.sourceItems.map((item) => {
        const snapshot = item.toSnapshot();

        return {
          sourceItemId: snapshot.id,
          sourceExternalId: snapshot.externalId,
          feedItemId: `feed:${snapshot.externalId}`,
        };
      }),
    };
  }
}

export class FakeConversationProjection implements ConversationProjectionPort {
  readonly commands: ProjectConversationUnitsCommand[] = [];

  async project(
    command: ProjectConversationUnitsCommand,
  ): Promise<ProjectConversationUnitsResult> {
    this.commands.push(command);

    return {
      projected: command.conversationUnits.length,
      skippedOrphans: 0,
      skippedInvalid: 0,
    };
  }
}

export class EnrichingSourceItemEnrichment implements SourceItemEnrichmentPort {
  readonly commands: EnrichSourceItemsCommand[] = [];

  async enrich(
    command: EnrichSourceItemsCommand,
  ): Promise<EnrichSourceItemsResult> {
    this.commands.push(command);

    return {
      items: command.items.map((item) => ({
        ...item,
        body: `${item.body}\n\nArticle text:\nFull external article body.`,
        metadata: {
          ...(item.metadata ?? {}),
          articleContent: {
            status: "enriched",
            semanticFingerprint: "feedfacecafebeef",
            contentHash: "content-hash-1",
          },
        },
      })),
      enriched: command.items.length,
      skipped: 0,
      failed: 0,
    };
  }
}

export class FakeScanAttemptRepository implements ScanAttemptRepositoryPort {
  private readonly attempts = new Map<string, ScanAttempt>();

  async save(attempt: ScanAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();
    this.attempts.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.scanJobId}`,
      attempt,
    );
  }

  async findByScanJob(
    params: Parameters<ScanAttemptRepositoryPort["findByScanJob"]>[0],
  ): Promise<ScanAttempt | null> {
    return (
      this.attempts.get(
        `${params.tenantId}:${params.workspaceId}:${params.scanJobId}`,
      ) ?? null
    );
  }
}

export class FakeScanCursorRepository implements ScanCursorRepositoryPort {
  readonly saved: unknown[] = [];
  private cursor: Parameters<ScanCursorRepositoryPort["save"]>[0] | null = null;

  async save(
    command: Parameters<ScanCursorRepositoryPort["save"]>[0],
  ): Promise<void> {
    this.saved.push(command);
    this.cursor = command;
  }

  seed(command: Parameters<ScanCursorRepositoryPort["save"]>[0]): void {
    this.cursor = command;
  }

  async findBySourceBinding(): Promise<
    Parameters<ScanCursorRepositoryPort["save"]>[0] | null
  > {
    return this.cursor;
  }
}

export class FakeScanFailureQueue implements ScanFailureQueuePort {
  readonly retries: unknown[] = [];
  readonly deadLetters: unknown[] = [];

  async enqueueRetry(
    command: Parameters<ScanFailureQueuePort["enqueueRetry"]>[0],
  ): Promise<void> {
    this.retries.push(command);
  }

  async deadLetter(
    command: Parameters<ScanFailureQueuePort["deadLetter"]>[0],
  ): Promise<void> {
    this.deadLetters.push(command);
  }
}

export class FakeScanExecutionReporter implements ScanExecutionReporterPort {
  readonly succeeded: unknown[] = [];
  readonly failed: unknown[] = [];

  async reportSucceeded(
    command: Parameters<ScanExecutionReporterPort["reportSucceeded"]>[0],
  ): Promise<void> {
    this.succeeded.push(command);
  }

  async reportFailed(
    command: Parameters<ScanExecutionReporterPort["reportFailed"]>[0],
  ): Promise<void> {
    this.failed.push(command);
  }
}

export class FakeScanLease implements ScanLeasePort {
  readonly acquired: unknown[] = [];
  readonly released: ScanLease[] = [];
  private alreadyLeased = false;

  holdNextAcquire(): void {
    this.alreadyLeased = true;
  }

  async acquire(
    command: Parameters<ScanLeasePort["acquire"]>[0],
  ): Promise<ScanLease | null> {
    this.acquired.push(command);

    if (this.alreadyLeased) {
      return null;
    }

    return {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: command.scanJobId,
      workerId: command.workerId,
      fencingToken: `${command.scanJobId}:${command.workerId}:test`,
      leasedAt: command.leasedAt,
      expiresAt: new Date(
        command.leasedAt.getTime() + command.ttlSeconds * 1000,
      ),
    };
  }

  async release(lease: ScanLease): Promise<void> {
    this.released.push(lease);
  }
}
