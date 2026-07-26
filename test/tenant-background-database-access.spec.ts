import { PrismaDeliveryAttemptRepository } from "@social-monitor/delivery/adapters/persistence/prisma/prisma-delivery-attempt.repository";
import { PrismaDigestScheduleRepository } from "@social-monitor/delivery/adapters/persistence/prisma/prisma-digest-schedule.repository";
import { PrismaScanFailureQueueAdapter } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter";
import { PrismaScanPolicyRepository } from "@social-monitor/monitoring/adapters/persistence/prisma/prisma-scan-policy.repository";
import { PrismaInboxStoreAdapter } from "@social-monitor/platform-events/adapters/prisma/prisma-inbox-store.adapter";
import { PrismaOutboxStoreAdapter } from "@social-monitor/platform-events/adapters/prisma/prisma-outbox-store.adapter";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import {
  currentDatabaseAccess,
  type DatabaseAccess,
} from "@social-monitor/platform-persistence";
import { PrismaRelevanceMemoryProjectionRepository } from "@social-monitor/relevance/adapters/persistence/prisma/prisma-relevance-memory-projection.repository";
import { PrismaAutoSummaryCandidateRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-auto-summary-candidate.repository";
import { PrismaReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-job.repository";
import { PrismaReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-policy.repository";
import { PrismaSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-job.repository";
import {
  CryptoIdGenerator,
  FixedClock,
  tenantId,
} from "@social-monitor/shared-kernel";

describe("background tenant database access", () => {
  it("establishes explicit system access for unscoped polling adapters", async () => {
    const observed: (DatabaseAccess | undefined)[] = [];
    const findMany = async (): Promise<never[]> => {
      observed.push(currentDatabaseAccess());
      return [];
    };
    const queryRaw = async (): Promise<never[]> => {
      observed.push(currentDatabaseAccess());
      return [];
    };

    const summaryJobs = new PrismaSummaryJobRepository({
      summaryJob: { findMany },
    } as never);
    const readerSummaryJobs = new PrismaReaderSummaryJobRepository({
      readerSummaryJob: { findMany },
    } as never);
    const digestSchedules = new PrismaDigestScheduleRepository({
      digestSchedule: { findMany },
    } as never);
    const deliveryAttempts = new PrismaDeliveryAttemptRepository({
      deliveryAttempt: { findMany },
    } as never);
    const readerSummaryPolicies = new PrismaReaderSummaryPolicyRepository({
      readerSummaryPolicy: { findMany },
    } as never);
    const autoSummaryCandidates = new PrismaAutoSummaryCandidateRepository({
      $queryRaw: queryRaw,
    } as never);
    const scanPolicies = new PrismaScanPolicyRepository({
      scanPolicy: { findMany },
    } as never);
    const relevanceProjections =
      new PrismaRelevanceMemoryProjectionRepository({
        relevanceMemoryProjection: { findMany },
      } as never);
    const scanRetries = new PrismaScanFailureQueueAdapter(
      {
        scanFailureQueueEntry: { findMany },
      } as never,
      new InMemoryMetricsRecorder(),
      new CryptoIdGenerator(),
    );
    const outbox = new PrismaOutboxStoreAdapter(
      { outboxEvent: { findMany } } as never,
      new FixedClock(new Date(0)),
    );
    const inbox = new PrismaInboxStoreAdapter(
      {
        inboxRecord: {
          findUnique: async () => {
            observed.push(currentDatabaseAccess());
            return null;
          },
        },
      } as never,
      new CryptoIdGenerator(),
    );

    await summaryJobs.findRequested({ limit: 1 });
    await readerSummaryJobs.findRequested({ limit: 1 });
    await digestSchedules.findDue({ now: new Date(0), limit: 1 });
    await deliveryAttempts.findQueued({ limit: 1 });
    await readerSummaryPolicies.listScheduled({ limit: 1 });
    await autoSummaryCandidates.findDueCandidates({
      latestFeedItemObservedBefore: new Date(0),
      limit: 1,
    });
    await scanPolicies.findDue({ now: new Date(0), limit: 1 });
    await relevanceProjections.findDue({ now: new Date(0), limit: 1 });
    await scanRetries.drainRetries({ limit: 1 });
    await outbox.pending(1);
    await inbox.hasProcessed({
      consumerName: "tenant-scope-test",
      eventId: "event-1",
    });

    expect(observed).toHaveLength(11);
    expect(observed).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "system" })]),
    );
    expect(observed.every((access) => access?.kind === "system")).toBe(true);
    expect(currentDatabaseAccess()).toBeUndefined();
  });

  it("rejects partially scoped polling before querying Prisma", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PrismaSummaryJobRepository({
      summaryJob: { findMany },
    } as never);

    await expect(
      repository.findRequested({
        tenantId: tenantId("00000000-0000-7000-8000-000000000010"),
        limit: 1,
      }),
    ).rejects.toThrow(
      "Summary job polling scope must include tenant and workspace",
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
