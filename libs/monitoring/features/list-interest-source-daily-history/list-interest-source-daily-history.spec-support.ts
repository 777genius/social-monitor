import {
  FixedClock,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { ScanJob, ScanPolicy, SourceBinding, Interest } from "../../domain";
import type {
  FindScanExecutionAttemptQuery,
  ListScanJobsBySourceBindingQuery,
  ListScanJobsBySourceBindingResult,
  ListScanJobsBySourceBindingWindowQuery,
  ListScanJobsBySourceBindingWindowResult,
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  ListInterestsQuery,
  ListInterestsResult,
  ScanExecutionAttemptReadPort,
  ScanExecutionAttemptSnapshot,
  ScanJobHistoryReadPort,
  ScanPolicyRepositoryPort,
  ScanSchedulerDecisionHistoryPort,
  ScanSchedulerDecisionRecord,
  SourceBindingRepositoryPort,
  InterestRepositoryPort,
} from "../../ports";
import { ListInterestSourceDailyHistoryUseCase } from "./list-interest-source-daily-history.use-case";

export const tenant = tenantId("tenant-interest-source-history");
export const workspace = workspaceId("workspace-interest-source-history");
export const now = new Date("2026-06-26T10:00:00.000Z");

class FakeInterestRepository implements InterestRepositoryPort {
  private readonly interests = new Map<string, Interest>();

  async save(interest: Interest): Promise<void> {
    const snapshot = interest.toSnapshot();
    this.interests.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`,
      interest,
    );
  }

  async findByName(): Promise<Interest | null> {
    return null;
  }

  async findById(
    params: Parameters<InterestRepositoryPort["findById"]>[0],
  ): Promise<Interest | null> {
    return (
      this.interests.get(
        `${params.tenantId}:${params.workspaceId}:${params.interestId}`,
      ) ?? null
    );
  }

  async list(query: ListInterestsQuery): Promise<ListInterestsResult> {
    return {
      interests: [...this.interests.values()]
        .filter((interest) => {
          const snapshot = interest.toSnapshot();

          return (
            snapshot.tenantId === query.tenantId &&
            snapshot.workspaceId === query.workspaceId
          );
        })
        .slice(0, query.limit),
    };
  }
}

class FakeSourceBindings implements SourceBindingRepositoryPort {
  private readonly bindings = new Map<string, SourceBinding>();

  async save(binding: SourceBinding): Promise<void> {
    const snapshot = binding.toSnapshot();
    this.bindings.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`,
      binding,
    );
  }

  async findByInterestAndProvider(): Promise<SourceBinding | null> {
    return null;
  }

  async findById(
    params: Parameters<SourceBindingRepositoryPort["findById"]>[0],
  ): Promise<SourceBinding | null> {
    return (
      this.bindings.get(
        `${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`,
      ) ?? null
    );
  }

  async listByInterest(
    query: ListSourceBindingsQuery,
  ): Promise<ListSourceBindingsResult> {
    return {
      sourceBindings: [...this.bindings.values()]
        .filter((binding) => {
          const snapshot = binding.toSnapshot();

          return (
            snapshot.tenantId === query.tenantId &&
            snapshot.workspaceId === query.workspaceId &&
            snapshot.interestId === query.interestId
          );
        })
        .slice(0, query.limit),
    };
  }
}

class FakeScanHistory implements ScanJobHistoryReadPort {
  private readonly jobs = new Map<string, ScanJob>();

  async save(job: ScanJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobs.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`,
      job,
    );
  }

  async listBySourceBinding(
    query: ListScanJobsBySourceBindingQuery,
  ): Promise<ListScanJobsBySourceBindingResult> {
    return {
      scanJobs: this.matchSourceBinding(query).slice(0, query.limit),
    };
  }

  async listBySourceBindingWindow(
    query: ListScanJobsBySourceBindingWindowQuery,
  ): Promise<ListScanJobsBySourceBindingWindowResult> {
    return {
      scanJobs: this.matchSourceBinding(query)
        .filter((job) => {
          const snapshot = job.toSnapshot();

          return (
            snapshot.requestedAt.getTime() >= query.windowStartedAt.getTime() &&
            snapshot.requestedAt.getTime() < query.windowEndedAt.getTime()
          );
        })
        .slice(0, query.limit),
      truncated: false,
    };
  }

  private matchSourceBinding(query: {
    readonly tenantId: typeof tenant;
    readonly workspaceId: typeof workspace;
    readonly sourceBindingId: string;
  }): ScanJob[] {
    return [...this.jobs.values()].filter((job) => {
      const snapshot = job.toSnapshot();

      return (
        snapshot.tenantId === query.tenantId &&
        snapshot.workspaceId === query.workspaceId &&
        snapshot.sourceBindingId === query.sourceBindingId
      );
    });
  }
}

class FakeScanPolicies implements ScanPolicyRepositoryPort {
  private readonly policies = new Map<string, ScanPolicy>();

  async save(policy: ScanPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();
    this.policies.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.sourceBindingId}`,
      policy,
    );
  }

  async findDue(): Promise<readonly ScanPolicy[]> {
    return [];
  }

  async findBySourceBinding(
    params: Parameters<ScanPolicyRepositoryPort["findBySourceBinding"]>[0],
  ): Promise<ScanPolicy | null> {
    return (
      this.policies.get(
        `${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`,
      ) ?? null
    );
  }
}

class FakeScanExecutionAttempts implements ScanExecutionAttemptReadPort {
  private readonly attempts = new Map<string, ScanExecutionAttemptSnapshot>();

  save(attempt: ScanExecutionAttemptSnapshot): void {
    this.attempts.set(
      `${attempt.tenantId}:${attempt.workspaceId}:${attempt.scanJobId}`,
      attempt,
    );
  }

  async findLatestByScanJob(
    query: FindScanExecutionAttemptQuery,
  ): Promise<ScanExecutionAttemptSnapshot | null> {
    return (
      this.attempts.get(
        `${query.tenantId}:${query.workspaceId}:${query.scanJobId}`,
      ) ?? null
    );
  }
}

class FakeSchedulerDecisionHistory implements ScanSchedulerDecisionHistoryPort {
  private readonly records: ScanSchedulerDecisionRecord[] = [];

  async recordBatch(
    command: Parameters<ScanSchedulerDecisionHistoryPort["recordBatch"]>[0],
  ): Promise<void> {
    this.records.push(...command.records);
  }

  async listBySourceBindingWindow(
    query: Parameters<
      ScanSchedulerDecisionHistoryPort["listBySourceBindingWindow"]
    >[0],
  ): ReturnType<ScanSchedulerDecisionHistoryPort["listBySourceBindingWindow"]> {
    return Promise.resolve({
      records: this.records
        .filter((record) => (
          record.tenantId === query.tenantId &&
          record.workspaceId === query.workspaceId &&
          record.sourceBindingId === query.sourceBindingId &&
          record.evaluatedAt.getTime() >= query.windowStartedAt.getTime() &&
          record.evaluatedAt.getTime() < query.windowEndedAt.getTime()
        ))
        .sort((left, right) => {
          const evaluatedDiff =
            right.evaluatedAt.getTime() - left.evaluatedAt.getTime();

          return evaluatedDiff === 0
            ? right.id.localeCompare(left.id)
            : evaluatedDiff;
        })
        .slice(0, query.limit),
      truncated: false,
    });
  }
}

export const makeFixture = async () => {
  const interests = new FakeInterestRepository();
  const bindings = new FakeSourceBindings();
  const policies = new FakeScanPolicies();
  const scanJobs = new FakeScanHistory();
  const attempts = new FakeScanExecutionAttempts();
  const schedulerDecisions = new FakeSchedulerDecisionHistory();
  const useCase = new ListInterestSourceDailyHistoryUseCase(
    interests,
    bindings,
    policies,
    scanJobs,
    attempts,
    new FixedClock(now),
    schedulerDecisions,
  );
  await interests.save(
    Interest.create({
      id: "interest-source-history",
      tenantId: tenant,
      workspaceId: workspace,
      name: "Source history",
      query: "source history",
      createdAt: new Date("2026-06-24T00:00:00.000Z"),
    }),
  );

  return {
    bindings,
    policies,
    schedulerDecisions,
    useCase,
    saveSchedulerDecision: async (
      record: Omit<
        ScanSchedulerDecisionRecord,
        "tenantId" | "workspaceId"
      >,
    ) => {
      await schedulerDecisions.recordBatch({
        records: [{
          ...record,
          tenantId: tenant,
          workspaceId: workspace,
        }],
      });
    },
    saveCompletedScan: async (params: {
      readonly id: string;
      readonly binding: SourceBinding;
      readonly requestedAt: string;
      readonly status: "succeeded" | "failed";
      readonly failureReason?: string;
      readonly fetched: number;
      readonly inserted: number;
      readonly skippedDuplicates: number;
      readonly projected: number;
    }) => {
      const binding = params.binding.toSnapshot();
      const requestedAt = new Date(params.requestedAt);
      const enqueuedAt = new Date(requestedAt.getTime() + 1000);
      const completedAt = new Date(enqueuedAt.getTime() + 1000);
      const requested = ScanJob.request({
        id: params.id,
        tenantId: tenant,
        workspaceId: workspace,
        sourceBindingId: binding.id,
        scanPolicyId: `scan-policy-${binding.id}`,
        idempotencyKey: `scan:${params.id}`,
        requestedAt,
      });
      const enqueued = requested.markEnqueued({ enqueuedAt });
      const completed =
        params.status === "succeeded"
          ? enqueued.markSucceeded({ completedAt })
          : enqueued.markFailed({
              completedAt,
              failureReason:
                params.failureReason ?? "provider_unavailable: source failed",
            });
      await scanJobs.save(completed);
      await attempts.save({
        tenantId: tenant,
        workspaceId: workspace,
        scanJobId: params.id,
        sourceBindingId: binding.id,
        status: params.status,
        startedAt: enqueuedAt,
        finishedAt: completedAt,
        fetched: params.fetched,
        inserted: params.inserted,
        skippedDuplicates: params.skippedDuplicates,
        projected: params.projected,
        failureReason: params.failureReason,
      });
    },
  };
};

export const makeBinding = (id: string, providerKey: string): SourceBinding =>
  SourceBinding.create({
    id,
    tenantId: tenant,
    workspaceId: workspace,
    interestId: "interest-source-history",
    providerKey,
    capabilityProfileVersion: 1,
    config: { query: providerKey },
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
  });

export const makePolicy = (
  binding: SourceBinding,
  params: {
    readonly intervalSeconds?: number;
    readonly freshnessSeconds?: number;
  } = {},
): ScanPolicy => {
  const snapshot = binding.toSnapshot();

  return ScanPolicy.create({
    id: `scan-policy-${snapshot.id}`,
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: snapshot.id,
    intervalSeconds: params.intervalSeconds ?? 300,
    freshnessSeconds: params.freshnessSeconds ?? 900,
    retryBudget: 3,
    nextRunAt: new Date("2026-06-26T10:00:00.000Z"),
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
  });
};
