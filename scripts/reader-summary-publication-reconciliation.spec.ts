import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FixedClock,
  type IdGenerator,
  ok,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";
import { DeterministicReaderSummaryModelAdapter } from "@social-monitor/summary/adapters/model/deterministic-reader-summary-model.adapter";
import { InMemorySummaryEventPublisher } from "@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher";
import { InMemoryReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-artifact.repository";
import { InMemoryReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-policy.repository";
import { InMemoryReaderSummaryPublication } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-publication";
import type {
  EnqueueReaderSummaryJobCommand,
  ReaderSummaryJobQueuePort,
  ReaderSummaryGitHubProjectionReaderPort,
  ReaderSummaryModelInput,
  ReaderSummaryModelPort,
  ReserveSummaryJobQuotaCommand,
  ReserveSummaryJobQuotaResult,
  SummaryQuotaPort,
} from "@social-monitor/summary/ports";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import type { BuildReaderSummaryTopicMapUseCase } from "@social-monitor/summary/features/build-reader-summary-topic-map/build-reader-summary-topic-map.use-case";
import {
  emptyReaderSummaryTopicMap,
  ReaderSummaryPublicationPolicy,
  type ReaderSummaryPublicationDecision,
} from "@social-monitor/summary/domain";

import {
  assertReaderSummaryDbPublicationFailpointInactive,
  createRecoverableReaderSummaryPublication,
} from "./lib/reader-summary-db-publication-reconciliation";
import {
  readerSummaryProductionDayAttemptIdentity,
  readerSummaryProductionDayIdempotencyKey,
} from "./lib/reader-summary-production-day-attempt-identity";

const now = new Date("2026-08-13T08:00:00.000Z");
const periodStartedAt = new Date("2026-08-13T00:00:00.000Z");
const periodEndedAt = new Date("2026-08-14T00:00:00.000Z");
const tenant = tenantId("10000000-0000-4000-8000-000000000001");
const workspace = workspaceId("20000000-0000-4000-8000-000000000002");
const periodKey =
  "daily:2026-08-13T00:00:00.000Z:2026-08-14T00:00:00.000Z:UTC";

describe("reader summary DB publication reconciliation", () => {
  it("replays the real request and execution use cases without another model call", async () => {
    const directory = mkdtempSync(join(tmpdir(), "summary-db-publication-"));
    try {
      const jobs = new InMemoryReaderSummaryJobRepository();
      const artifacts = new InMemoryReaderSummaryArtifactRepository();
      const events = new InMemorySummaryEventPublisher();
      const ids = new SequenceIdGenerator([
        "30000000-0000-4000-8000-000000000003",
        "40000000-0000-4000-8000-000000000004",
        "50000000-0000-4000-8000-000000000005",
      ]);
      const clock = new FixedClock(now);
      const model = countingModel(new DeterministicReaderSummaryModelAdapter());
      const attemptIdentity = readerSummaryProductionDayAttemptIdentity({
        tenantId: tenant,
        workspaceId: workspace,
        periodKey,
        mode: { kind: "live-production" },
      });
      const attestations = [executionAttestation()];
      const recoverable = createRecoverableReaderSummaryPublication({
        delegate: new InMemoryReaderSummaryPublication(jobs, artifacts, events),
        recoveryDirectory: directory,
        attemptIdentity,
        attestations: () => attestations,
      });
      const request = new RequestReaderSummaryUseCase(
        jobs,
        new CapturingQueue(),
        new AllowingQuota(),
        ids,
        clock,
      );
      const execute = new ExecuteReaderSummaryJobUseCase(
        jobs,
        artifacts,
        new InMemoryReaderSummaryPolicyRepository(),
        { async select() { return evidenceSelection(); } },
        model.port,
        recoverable.publication,
        ids,
        clock,
        undefined,
        undefined,
        successfulEmptyTopicMapBuilder(),
        new AlwaysPublishPolicy(),
        zeroEligibleGitHubProjectionReader(),
      );

      const first = await runProductionDayRequestExecution({
        request,
        execute,
        attemptIdentity,
        failpoint: "after-db-before-state",
      });
      expect(first.error).toMatch(/after DB publication before terminal state/u);
      expect(model.calls()).toBe(1);

      const firstJob = jobs.all()[0]?.toSnapshot();
      const firstArtifact = artifacts.all()[0]?.toSnapshot();
      expect(firstJob).toMatchObject({
        id: "30000000-0000-4000-8000-000000000003",
        status: "no_signal",
        readerSummaryId: "40000000-0000-4000-8000-000000000004",
      });
      expect(firstArtifact?.readerSummaryId).toBe(
        "40000000-0000-4000-8000-000000000004",
      );
      const recoveryBytesBefore = onlyRecoveryReceipt(directory);

      const replay = await runProductionDayRequestExecution({
        request,
        execute,
        attemptIdentity,
      });
      expect(replay).toMatchObject({
        requestCreated: false,
        readerSummaryJobId: firstJob?.id,
        readerSummaryArtifactId: firstArtifact?.readerSummaryId,
      });
      expect(model.calls()).toBe(1);
      expect(onlyRecoveryReceipt(directory).equals(recoveryBytesBefore)).toBe(true);
      expect(
        recoverable.recovery?.load({
          tenantId: tenant,
          workspaceId: workspace,
          periodKey,
          readerSummaryJobId: replay.readerSummaryJobId!,
          readerSummaryArtifactId: replay.readerSummaryArtifactId!,
        }),
      ).toEqual(attestations);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

const runProductionDayRequestExecution = async (input: {
  readonly request: RequestReaderSummaryUseCase;
  readonly execute: ExecuteReaderSummaryJobUseCase;
  readonly attemptIdentity: string;
  readonly failpoint?: string;
}): Promise<{
  readonly requestCreated?: boolean;
  readonly readerSummaryJobId?: string;
  readonly readerSummaryArtifactId?: string;
  readonly error?: string;
}> => {
  try {
    const requested = await input.request.execute({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      cadence: "daily",
      period: { startedAt: periodStartedAt, endedAt: periodEndedAt, timezone: "UTC" },
      idempotencyKey: readerSummaryProductionDayIdempotencyKey(input.attemptIdentity),
      correlationId: "reader-summary-db-publication-reconciliation",
    });
    if (!requested.ok) throw requested.error;
    const executed = await input.execute.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: requested.value.readerSummaryJobId,
      maxEvidenceItems: 20,
    });
    if (!executed.ok) throw executed.error;
    assertReaderSummaryDbPublicationFailpointInactive(input.failpoint);
    return {
      requestCreated: requested.value.created,
      readerSummaryJobId: executed.value.readerSummaryJobId,
      readerSummaryArtifactId: executed.value.readerSummaryId,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

const countingModel = (delegate: ReaderSummaryModelPort) => {
  let calls = 0;
  const port = new Proxy(delegate, {
    get(target, property, receiver) {
      if (property !== "generate") return Reflect.get(target, property, receiver);
      return async (...args: Parameters<ReaderSummaryModelPort["generate"]>) => {
        calls += 1;
        return target.generate(...args);
      };
    },
  });
  return { port, calls: () => calls };
};

const successfulEmptyTopicMapBuilder = () =>
  ({
    async execute() {
      return ok(emptyReaderSummaryTopicMap());
    },
  }) as unknown as BuildReaderSummaryTopicMapUseCase;

class AlwaysPublishPolicy extends ReaderSummaryPublicationPolicy {
  override evaluate(): ReaderSummaryPublicationDecision {
    return {
      status: "published",
      qualityPassed: true,
      canonicalScore: 1,
      shadow: {
        mode: "shadow",
        policyVersion: "reader_summary_publication_shadow_v1",
        riskScore: 0,
        signals: [],
      },
      reasons: [],
    };
  }
}

const zeroEligibleGitHubProjectionReader =
  (): ReaderSummaryGitHubProjectionReaderPort => ({
    async read() {
      return { eligibleBindingIds: [], items: [], pageCount: 1 };
    },
  });

class SequenceIdGenerator implements IdGenerator {
  constructor(private readonly values: readonly string[]) {}
  private index = 0;
  generate(): string {
    const value = this.values[this.index];
    if (value === undefined) throw new Error("Unexpected test id generation");
    this.index += 1;
    return value;
  }
}

class CapturingQueue implements ReaderSummaryJobQueuePort {
  readonly commands: EnqueueReaderSummaryJobCommand[] = [];
  async canAccept(): Promise<boolean> { return true; }
  async enqueue(command: EnqueueReaderSummaryJobCommand): Promise<void> {
    this.commands.push(command);
  }
}

class AllowingQuota implements SummaryQuotaPort {
  async reserveSummaryJob(
    _command: ReserveSummaryJobQuotaCommand,
  ): Promise<ReturnType<typeof ok<ReserveSummaryJobQuotaResult>>> {
    void _command;
    return ok({ remaining: 1, resetAt: periodEndedAt.toISOString() });
  }
}

const onlyRecoveryReceipt = (directory: string): Buffer => {
  const files = readdirSync(directory).filter((name) => name.endsWith(".v1.json"));
  expect(files).toHaveLength(1);
  return readFileSync(join(directory, files[0]!));
};

const evidenceSelection = (): ReaderSummaryModelInput["evidence"] => {
  return {
    rankingPolicyVersion: "story_ranking_v1",
    sourceWindow: {
      windowId: "workspace:db-publication-reconciliation",
      startedAt: periodStartedAt,
      endedAt: periodEndedAt,
      selectedFeedItemIds: [],
      storyClusterIds: [],
    },
    clusters: [],
    selectedEvidence: [],
  };
};

const executionAttestation = () => ({
  taskRole: "summary" as const,
  attempt: "primary",
  normalizedOutputSha256: "c".repeat(64),
  attestation: {
    schemaVersion: 1 as const,
    requestId: "fixture-request",
    purpose: "social_monitor.reader_summary.generate",
    canonicalRequestSha256: "d".repeat(64),
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort: "xhigh",
    runtimeEngine: "subscription-runtime-cli",
    runtimePackageVersion: "fixture-runtime",
    launcherSha256: "e".repeat(64),
    selectedOutputKind: "structured_output" as const,
    selectedOutputSha256: "f".repeat(64),
  },
});
