import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { InMemoryQueuePublisher } from "@social-monitor/platform-queue/adapters/in-memory";
import { WorkerRuntime } from "@social-monitor/platform-worker";
import { ReaderSummaryJobQueuePublisherAdapter } from "@social-monitor/summary/adapters/messaging/reader-summary-job-queue.adapter";
import { InMemorySummaryEventPublisher } from "@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher";
import { ReaderSummaryPromotionMetricsRecorder } from "@social-monitor/summary/adapters/metrics/reader-summary-promotion-metrics.recorder";
import { DeterministicReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/deterministic-reader-summary-model.adapter";
import { InMemoryReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPublication } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-publication";
import { InMemoryReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-policy.repository";
import {
  ReaderSummaryPolicy,
  defaultReaderSummaryGenerationPolicy,
} from "@social-monitor/summary/domain";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { readerSummaryPromotionControl } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { SchedulePeriodicReaderSummariesUseCase } from "@social-monitor/summary/features/schedule-periodic-reader-summaries/schedule-periodic-reader-summaries.use-case";
import { ExecuteReaderSummaryJobCommandHandler } from "@social-monitor/summary/interfaces/queue/execute-reader-summary-job-command.handler";
import type {
  ReaderSummaryEvidenceSelectorPort,
  SummaryQuotaPort,
} from "@social-monitor/summary/ports";
import {
  FixedClock,
  type IdGenerator,
  ok,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { PeriodicReaderSummarySchedulerLoop } from "../apps/intelligence-worker/src/periodic-reader-summary-scheduler-loop";
import { ReaderSummaryJobQueueDrainLoop } from "../apps/intelligence-worker/src/reader-summary-job-queue-drain-loop";
import { InMemorySummaryJobQueueReader } from "../apps/intelligence-worker/src/summary-job-queue-reader";

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `periodic-reader-summary-e2e-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class ScheduledReaderSummaryEvidenceSelector implements ReaderSummaryEvidenceSelectorPort {
  async select(
    query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
  ): ReturnType<ReaderSummaryEvidenceSelectorPort["select"]> {
    return {
      rankingPolicyVersion: "story_ranking_v1",
      personalization: {
        memoryGuidanceStatus: "disabled",
        memoryGuidanceApplied: false,
        providerPreferenceCount: 0,
        keywordPreferenceCount: 0,
        mutedKeywordCount: 0,
        blockedProviderCount: 0,
        signals: ["shared_schedule"],
      },
      sourceWindow: {
        windowId: `${query.period.periodKey}:periodic-reader-summary-e2e`,
        startedAt: query.period.startedAt,
        endedAt: query.period.endedAt,
        selectedFeedItemIds: ["feed-shared-ai-tooling"],
        storyClusterIds: ["story:shared-ai-tooling"],
      },
      clusters: [
        {
          id: "story:shared-ai-tooling",
          storyKey: "url:example.com/shared-ai-tooling",
          representativeFeedItemId: "feed-shared-ai-tooling",
          duplicateFeedItemIds: [],
          interestIds: ["topic-ai"],
          providerKeys: ["github-repo-radar"],
          score: 2.1,
          observedAtRange: {
            startedAt: query.period.startedAt,
            endedAt: query.period.endedAt,
          },
          whyImportant: ["Scheduled shared period selected this item."],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: "feed-shared-ai-tooling",
          sourceItemId: "source-shared-ai-tooling",
          sourceBindingId: "binding-github-repo-radar",
          interestId: "topic-ai",
          providerKey: "github-repo-radar",
          providerName: "GitHub Repo Radar",
          canonicalUrl: "https://example.com/shared-ai-tooling",
          title: "Shared AI tooling signal",
          bodyPreview:
            "Developers are repeatedly discussing the same shared AI tooling signal.",
          publishedAt: query.period.startedAt,
          observedAt: query.period.endedAt,
          score: 2.1,
          whyImportant: ["Fresh shared scheduled evidence."],
        },
      ],
    };
  }
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort["reserveSummaryJob"]> {
    return ok({
      remaining: 99,
      resetAt: "2026-07-15T07:00:00.000Z",
    });
  }
}

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId("tenant-periodic-reader-summary-e2e");
  const workspace = workspaceId("workspace-periodic-reader-summary-e2e");
  const queue = new InMemoryQueuePublisher();
  const metrics = new InMemoryMetricsRecorder();
  const jobs = new InMemoryReaderSummaryJobRepository();
  const artifacts = new InMemoryReaderSummaryArtifactRepository();
  const policies = new InMemoryReaderSummaryPolicyRepository();
  const events = new InMemorySummaryEventPublisher();
  const ids = new SequenceIdGenerator();
  const schedulerNow = new Date("2026-07-15T06:00:00.000Z");

  await policies.save(
    ReaderSummaryPolicy.create({
      id: "policy-periodic-reader-summary-e2e",
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      ...defaultReaderSummaryGenerationPolicy(),
      schedule: {
        enabled: true,
        timezone: "Europe/Kiev",
        cadences: ["daily", "weekly", "monthly"],
      },
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    }),
  );

  const requestReaderSummary = new RequestReaderSummaryUseCase(
    jobs,
    new ReaderSummaryJobQueuePublisherAdapter(queue, metrics),
    new AllowingSummaryQuota(),
    ids,
    new FixedClock(schedulerNow),
  );
  const schedulePeriodicReaderSummaries =
    new SchedulePeriodicReaderSummariesUseCase(policies, requestReaderSummary);
  const schedulerLoop = new PeriodicReaderSummarySchedulerLoop(
    schedulePeriodicReaderSummaries,
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
      readyAtUtc: { hour: 6, minute: 0 },
      tenantId: tenant,
      workspaceId: workspace,
    },
    new FixedClock(schedulerNow),
  );

  await schedulerLoop.onModuleInit();
  await schedulerLoop.onApplicationShutdown(
    "periodic-reader-summary-e2e-scheduler-complete",
  );

  assert(
    queue.all().length === 3,
    `scheduler must enqueue daily, weekly and monthly jobs, got ${queue.all().length}`,
  );

  const repeat = await schedulePeriodicReaderSummaries.execute({
    tenantId: tenant,
    workspaceId: workspace,
    now: schedulerNow,
    limit: 10,
    correlationId: "periodic-reader-summary-e2e-repeat",
  });
  assert(repeat.ok, "repeat scheduler execution must succeed");
  assert(
    repeat.value.existing === 3,
    `repeat scheduler execution must find three existing jobs, got ${repeat.value.existing}`,
  );
  assert(
    queue.all().length === 3,
    "repeat scheduler execution must not enqueue duplicate jobs",
  );

  const runtime = new WorkerRuntime({ serviceName: "intelligence-worker" });
  runtime.onModuleInit();
  const drainLoop = new ReaderSummaryJobQueueDrainLoop(
    new InMemorySummaryJobQueueReader(queue),
    new ExecuteReaderSummaryJobCommandHandler(
      new ExecuteReaderSummaryJobUseCase(
        jobs,
        artifacts,
        policies,
        new ScheduledReaderSummaryEvidenceSelector(),
        new DeterministicReaderSummaryModelAdapter(),
        new InMemoryReaderSummaryPublication(jobs, artifacts, events),
        ids,
        new FixedClock(new Date("2026-07-15T06:05:00.000Z")),
        readerSummaryPromotionControl(
          new ReaderSummaryPromotionMetricsRecorder(metrics),
        ),
      ),
      metrics,
      runtime,
    ),
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
    },
    metrics,
    new FixedClock(new Date("2026-07-15T06:05:30.000Z")),
  );

  await drainLoop.onModuleInit();
  await drainLoop.onApplicationShutdown(
    "periodic-reader-summary-e2e-drain-complete",
  );
  await runtime.onApplicationShutdown(
    "periodic-reader-summary-e2e-runtime-complete",
  );

  assert(queue.all().length === 0, "reader summary queue must be drained");
  assert(
    artifacts.all().length === 3,
    `drain loop must persist three reader summary artifacts, got ${artifacts.all().length}`,
  );
  assert(
    events.all().length === 3,
    `drain loop must publish three reader_summary.ready events, got ${events.all().length}`,
  );

  const artifactPeriods = artifacts
    .all()
    .map((artifact) => artifact.toSnapshot().period)
    .sort((left, right) => left.cadence.localeCompare(right.cadence));
  assert(
    artifactPeriods.every((period) => period.timezone === "UTC"),
    "scheduled artifacts must always use UTC periods",
  );
  assert(
    artifactPeriods.map((period) => period.periodKey).join("\n") ===
      [
        "daily:2026-07-14T00:00:00.000Z:2026-07-15T00:00:00.000Z:UTC",
        "monthly:2026-06-01T00:00:00.000Z:2026-07-01T00:00:00.000Z:UTC",
        "weekly:2026-07-06T00:00:00.000Z:2026-07-13T00:00:00.000Z:UTC",
      ].join("\n"),
    "scheduled artifacts must use previous closed UTC periods",
  );
  assert(
    artifacts
      .all()
      .every((artifact) => artifact.toSnapshot().userId === undefined),
    "scheduled reader summaries must be shared, not per-user",
  );
  assert(
    metrics.counterValue("queue_commands_enqueued_total", {
      command_type: "reader_summary.job.execute",
      job_type: "reader_summary",
      status: "enqueued",
    }) === 3,
    "scheduler must record three enqueued reader summary commands",
  );
  assert(
    metrics.counterValue("summary_jobs_total", {
      job_type: "readerSummary",
      status: "succeeded",
      worker: "intelligence-worker",
    }) === 3,
    "drain loop must record three succeeded reader summary jobs",
  );

  console.log("Periodic ReaderSummary E2E smoke OK");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
