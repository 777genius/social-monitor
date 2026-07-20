import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { InMemoryQueuePublisher } from "@social-monitor/platform-queue/adapters/in-memory";
import { WorkerRuntime } from "@social-monitor/platform-worker";
import { ReaderSummaryJobQueuePublisherAdapter } from "@social-monitor/summary/adapters/messaging/reader-summary-job-queue.adapter";
import { InMemorySummaryEventPublisher } from "@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher";
import { DeterministicReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/deterministic-reader-summary-model.adapter";
import { InMemoryReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-policy.repository";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { ExecuteReaderSummaryJobCommandHandler } from "@social-monitor/summary/interfaces/queue/execute-reader-summary-job-command.handler";
import {
  FixedClock,
  type IdGenerator,
  ok,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";
import type { ReaderSummaryItem } from "@social-monitor/summary/domain";
import type {
  ReaderSummaryEvidenceSelectorPort,
  SummaryQuotaPort,
  UserSummaryPreferenceReaderPort,
} from "@social-monitor/summary/ports";

import { ReaderSummaryJobQueueDrainLoop } from "../apps/intelligence-worker/src/reader-summary-job-queue-drain-loop";
import { InMemorySummaryJobQueueReader } from "../apps/intelligence-worker/src/summary-job-queue-reader";

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `readerSummary-workflow-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class SelectedReaderSummaryEvidenceSelector implements ReaderSummaryEvidenceSelectorPort {
  async select(): ReturnType<ReaderSummaryEvidenceSelectorPort["select"]> {
    return {
      rankingPolicyVersion: "story_ranking_v1",
      personalization: {
        memoryGuidanceStatus: "available",
        memoryGuidanceApplied: true,
        providerPreferenceCount: 1,
        keywordPreferenceCount: 1,
        mutedKeywordCount: 0,
        blockedProviderCount: 0,
        signals: ["memory_guidance_available", "memory_guidance_applied"],
      },
      sourceWindow: {
        windowId: "workspace:readerSummary-workflow-smoke",
        startedAt: new Date("2026-06-23T08:00:00.000Z"),
        endedAt: new Date("2026-06-23T08:30:00.000Z"),
        selectedFeedItemIds: ["feed-reddit"],
        storyClusterIds: ["story:ai-tooling"],
      },
      clusters: [
        {
          id: "story:ai-tooling",
          storyKey: "url:example.com/ai-tooling",
          representativeFeedItemId: "feed-reddit",
          duplicateFeedItemIds: ["feed-github"],
          interestIds: ["topic-ai", "topic-github"],
          providerKeys: ["reddit", "github"],
          score: 2.4,
          observedAtRange: {
            startedAt: new Date("2026-06-23T08:00:00.000Z"),
            endedAt: new Date("2026-06-23T08:30:00.000Z"),
          },
          whyImportant: ["Clustered 2 similar items"],
        },
      ],
      selectedEvidence: [
        {
          feedItemId: "feed-reddit",
          sourceItemId: "source-reddit",
          sourceBindingId: "binding-reddit",
          interestId: "topic-ai",
          providerKey: "reddit",
          providerName: "Reddit",
          canonicalUrl: "https://example.com/ai-tooling",
          title: "AI tooling library is trending",
          bodyPreview: "Developers are discussing a new AI tooling library.",
          publishedAt: new Date("2026-06-23T08:00:00.000Z"),
          observedAt: new Date("2026-06-23T08:01:00.000Z"),
          score: 2.4,
          whyImportant: ["Fresh item in the current monitoring window"],
        },
      ],
    };
  }
}

class WorkflowUserSummaryPreferenceReader implements UserSummaryPreferenceReaderPort {
  async findEffectivePreference(): ReturnType<UserSummaryPreferenceReaderPort["findEffectivePreference"]> {
    return {
      tone: "concise",
      maxKeyPoints: 1,
      includeRisks: false,
      includeSourceHighlights: true,
      customInstructions:
        "Prioritize practical agent tooling links and skip low-confidence risks.",
      rulesVersion: "summary.rules.workflow-user-preference.v1",
    };
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
  const tenant = tenantId("tenant-readerSummary-workflow-smoke");
  const workspace = workspaceId("workspace-readerSummary-workflow-smoke");
  const queue = new InMemoryQueuePublisher();
  const jobs = new InMemoryReaderSummaryJobRepository();
  const artifacts = new InMemoryReaderSummaryArtifactRepository();
  const policies = new InMemoryReaderSummaryPolicyRepository();
  const events = new InMemorySummaryEventPublisher();
  const metrics = new InMemoryMetricsRecorder();
  const ids = new SequenceIdGenerator();
  const clock = new FixedClock(new Date("2026-06-23T08:31:00.000Z"));
  const runtime = new WorkerRuntime({ serviceName: "intelligence-worker" });
  runtime.onModuleInit();

  const request = await new RequestReaderSummaryUseCase(
    jobs,
    new ReaderSummaryJobQueuePublisherAdapter(queue, metrics),
    new AllowingSummaryQuota(),
    ids,
    clock,
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    userId: "readerSummary-workflow-user",
    idempotencyKey: "readerSummary-workflow-smoke",
    correlationId: "readerSummary-workflow-smoke",
  });

  assert(request.ok, "readerSummary workflow smoke must create a readerSummary job");
  assert(
    queue.all().length === 1,
    `readerSummary request must enqueue one command, got ${queue.all().length}`,
  );

  const loop = new ReaderSummaryJobQueueDrainLoop(
    new InMemorySummaryJobQueueReader(queue),
    new ExecuteReaderSummaryJobCommandHandler(
      new ExecuteReaderSummaryJobUseCase(
        jobs,
        artifacts,
        policies,
        new SelectedReaderSummaryEvidenceSelector(),
        new DeterministicReaderSummaryModelAdapter(),
        events,
        ids,
        clock,
        undefined,
        new WorkflowUserSummaryPreferenceReader(),
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
    new FixedClock(new Date("2026-06-23T08:31:30.000Z")),
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown("readerSummary-workflow-smoke-complete");
  await runtime.onApplicationShutdown("readerSummary-workflow-smoke-complete");

  const job = await jobs.findById({
    tenantId: tenant,
    workspaceId: workspace,
    readerSummaryJobId: request.value.readerSummaryJobId,
  });
  const snapshot = job?.toSnapshot();
  assert(
    snapshot?.status === "completed",
    `expected completed readerSummary job, got ${snapshot?.status}`,
  );
  assert(
    typeof snapshot.readerSummaryId === "string",
    "readerSummary job must persist readerSummary artifact id",
  );
  assert(
    queue.all().length === 0,
    `readerSummary queue must drain, got ${queue.all().length}`,
  );
  assert(
    artifacts.all().length === 1,
    `readerSummary workflow must persist one artifact, got ${artifacts.all().length}`,
  );
  const artifact = artifacts.all()[0]?.toSnapshot();
  assert(
    artifact !== undefined,
    "readerSummary workflow must expose the persisted artifact snapshot",
  );
  assert(
    artifact.content !== undefined,
    "readerSummary workflow must persist the reader summary content",
  );
  assert(
    artifact.content.topReads.length > 0,
    "reader summary content must expose top reads",
  );
  assert(
    artifact.content.topReads.length === 1,
    "readerSummary workflow must apply the user max stories preference",
  );
  assert(
    artifact.executiveSummary.includes(
      "Prioritize practical agent tooling links",
    ),
    "readerSummary workflow must apply user custom summary instructions",
  );
  assert(
    artifact.risksAndUnknowns.length === 0,
    "readerSummary workflow must apply the user risk preference",
  );
  assert(
    artifact.lineage.rulesVersion.includes(
      "summary.rules.workflow-user-preference.v1",
    ),
    "readerSummary workflow lineage must preserve the user preference rules version",
  );
  assert(
    artifact.citationMap.length > 0,
    "readerSummary artifact must expose citations",
  );
  assert(
    new Set(artifact.content.topReads.map(readerTopReadKey)).size ===
      artifact.content.topReads.length,
    "reader summary top reads must not contain duplicate source links",
  );
  assert(
    artifact.content.sourceMix.some(
      (source) => source.providerKey === "github",
    ),
    "reader summary source mix must include clustered GitHub evidence",
  );
  assert(
    artifact.content.sourceMix.some(
      (source) => source.providerKey === "reddit",
    ),
    "reader summary source mix must include Reddit evidence",
  );
  assert(
    artifact.content.topReads[0]?.whyNow.includes("cross-source coverage"),
    "reader summary must explain why the top read matters now",
  );
  assert(
    artifact.userId === "readerSummary-workflow-user",
    "readerSummary workflow must persist the reader user id",
  );
  assert(
    artifact.personalization?.memoryGuidanceApplied === true,
    "readerSummary workflow must persist applied memory guidance metadata",
  );
  assert(
    artifact.personalization?.signals.includes("memory_guidance_applied"),
    "readerSummary workflow must expose memory guidance explanation signals",
  );
  assert(
    events.all().length === 1,
    `readerSummary workflow must publish one reader_summary.ready event, got ${events.all().length}`,
  );
  assert(
    metrics.counterValue("summary_jobs_total", {
      job_type: "readerSummary",
      status: "succeeded",
      worker: "intelligence-worker",
    }) === 1,
    "readerSummary workflow must record succeeded metric",
  );

  console.log("ReaderSummary workflow smoke OK");
}

const readerTopReadKey = (item: ReaderSummaryItem): string =>
  item.canonicalUrl ??
  item.citationIds.join("|") ??
  `${item.providerKey}:${item.title}`;

class AllowingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort["reserveSummaryJob"]> {
    return ok({
      remaining: 59,
      resetAt: "2026-06-23T09:00:00.000Z",
    });
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
