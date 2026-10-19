import type { FactoryProvider } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { currentDatabaseAccess } from "@social-monitor/platform-persistence";
import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReserveUsageQuotaUseCase } from "@social-monitor/usage/features/reserve-usage-quota/reserve-usage-quota.use-case";
import { PrismaUsageQuotaLedger } from "@social-monitor/usage/adapters/persistence/prisma/prisma-usage-quota-ledger";
import type {
  PrismaUsageTransactionClient,
  PrismaUsageQuotaBucketDelegate,
} from "@social-monitor/usage/adapters/persistence/prisma/prisma-usage-client";
import { InMemoryReaderSummaryJobQueueAdapter } from "@social-monitor/summary/adapters/messaging/reader-summary-job-queue.adapter";
import { UsageSummaryQuotaAdapter } from "@social-monitor/summary/adapters/quota/usage-summary-quota.adapter";
import {
  ReaderSummaryPolicy,
  defaultReaderSummaryGenerationPolicy,
  type ReaderSummaryJob,
} from "@social-monitor/summary/domain";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { SchedulePeriodicReaderSummariesUseCase } from "@social-monitor/summary/features/schedule-periodic-reader-summaries/schedule-periodic-reader-summaries.use-case";
import type {
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryPolicyRepositoryPort,
} from "@social-monitor/summary/ports";
import { SummaryRestModule } from "@social-monitor/summary/interfaces/rest/summary-rest.module";

import { guardRootClientDuringInteractiveTransaction } from "../libs/platform/persistence/src/postgres-runtime-pool-transaction-guard";

const scopes = [
  {
    tenantId: tenantId("11111111-1111-4111-8111-111111111111"),
    workspaceId: workspaceId("22222222-2222-4222-8222-222222222222"),
  },
  {
    tenantId: tenantId("33333333-3333-4333-8333-333333333333"),
    workspaceId: workspaceId("44444444-4444-4444-8444-444444444444"),
  },
];
const now = new Date("2026-10-19T08:00:00.000Z");

describe("periodic reader summary tenant composition", () => {
  it("scopes real quota transactions per policy and preserves queue idempotency", async () => {
    const calls: unknown[][] = [];
    const delegate: PrismaUsageQuotaBucketDelegate = {
      async deleteMany() {
        calls.push(["delete", currentDatabaseAccess()]);
        return { count: 0 };
      },
      async findUnique() {
        return null;
      },
      async upsert(args) {
        return args.create;
      },
    };
    const transaction = {
      usageQuotaBucket: delegate,
      async $executeRawUnsafe(_query: string, ...values: unknown[]) {
        calls.push(["scope", ...values]);
        return 1;
      },
    };
    const client = guardRootClientDuringInteractiveTransaction({
      ...transaction,
      async $transaction<T>(
        operation: (tx: PrismaUsageTransactionClient) => Promise<T>,
      ) {
        return operation({ ...transaction, usageQuotaBucket: { ...delegate } });
      },
    });
    const quota = new UsageSummaryQuotaAdapter(
      new ReserveUsageQuotaUseCase(
        new PrismaUsageQuotaLedger(client as never),
        new FixedClock(now),
      ),
      { quotaPerHour: 10 },
    );
    const saved = new Map<string, ReaderSummaryJob>();
    const jobs: ReaderSummaryJobRepositoryPort = {
      async save(job) {
        const snapshot = job.toSnapshot();
        expect(currentDatabaseAccess()).toEqual({
          kind: "tenant",
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
        });
        saved.set(snapshot.idempotencyKey, job);
      },
      async findByIdempotencyKey({ idempotencyKey }) {
        return saved.get(idempotencyKey) ?? null;
      },
      async findById() {
        return null;
      },
      async findRequested() {
        return [];
      },
      async claimForExecution() {
        return null;
      },
      async saveExecutionOutcome() {
        return false;
      },
    };
    const queue = new InMemoryReaderSummaryJobQueueAdapter();
    let nextId = 0;
    const request = new RequestReaderSummaryUseCase(
      jobs,
      queue,
      quota,
      { generate: () => `scheduled-job-${++nextId}` },
      new FixedClock(now),
    );
    const policies: ReaderSummaryPolicyRepositoryPort = {
      async save() {},
      async findByScope() {
        return null;
      },
      async listScheduled() {
        expect(currentDatabaseAccess()).toBeUndefined();
        return scopes.map((scope, index) =>
          ReaderSummaryPolicy.create({
            ...scope,
            id: `policy-${index}`,
            scope: { type: "workspace" },
            ...defaultReaderSummaryGenerationPolicy(),
            schedule: { enabled: true, timezone: "UTC", cadences: ["daily"] },
            createdAt: now,
            updatedAt: now,
          }),
        );
      },
    };
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SummaryRestModule,
    ) as FactoryProvider[];
    const provider = providers.find(
      (item) => item.provide === SchedulePeriodicReaderSummariesUseCase,
    );
    expect(provider).toBeDefined();
    const scheduler = provider!.useFactory(
      policies,
      request,
    ) as SchedulePeriodicReaderSummariesUseCase;
    const command = { limit: 10, now, correlationId: "periodic-scope-regression" };

    const result = await scheduler.execute(command);

    expect(result.ok && result.value.failures).toEqual([]);
    expect(result.ok && result.value.scheduled).toBe(2);
    expect(calls).toEqual(
      scopes.flatMap((scope) => [
        ["scope", scope.tenantId, scope.workspaceId, "false"],
        ["delete", { kind: "tenant", ...scope }],
      ]),
    );
    expect(queue.all()).toHaveLength(2);
    expect(currentDatabaseAccess()).toBeUndefined();

    const repeated = await scheduler.execute(command);

    expect(repeated.ok && repeated.value.existing).toBe(2);
    expect(queue.all()).toHaveLength(2);
    expect(calls).toHaveLength(4);
    expect(currentDatabaseAccess()).toBeUndefined();
  });
});
