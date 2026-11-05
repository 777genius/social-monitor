import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  FixedClock,
  type IdGenerator,
  ok,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";
import { ReaderSummaryArtifact, ReaderSummaryJob } from "@social-monitor/summary/domain";
import { InMemoryReaderSummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-artifact.repository";
import { readerSummaryArtifact } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact-fixture.spec-support";
import { notApplicableReaderSummaryGitHubProjectionAudit } from "@social-monitor/summary/domain/policies/reader-summary-github-projection-policy";
import type {
  EnqueueReaderSummaryJobCommand,
  ReaderSummaryJobQueuePort,
  ReaderSummaryJobRepositoryPort,
  SummaryQuotaPort,
} from "@social-monitor/summary/ports";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { ListReaderSummariesUseCase } from "@social-monitor/summary/features/list-reader-summaries/list-reader-summaries.use-case";
import { READER_SUMMARY_ARTIFACT_REPOSITORY } from "@social-monitor/summary/interfaces/rest/summary-provider-tokens";
import { SUMMARY_AGENT_RUNTIME_CLIENT_OPTIONS } from "@social-monitor/summary/interfaces/rest/summary-agent-runtime-provider-tokens";
import { listReaderSummariesResponseFromReaderSummaries } from "@social-monitor/summary/interfaces/rest/reader-summary-rest.mapper";
import request from "supertest";

import { AppModule } from "../apps/api-gateway/src/app.module";

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `reader-summary-job-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

describe("Reader summary V3 successor publication and read", () => {
  it.each([
    ["daily", "completed"], ["weekly", "completed"],
    ["daily", "no_signal"], ["weekly", "no_signal"],
  ] as const)(
    "requests one V3 successor for a published legacy %s %s workspace period",
    async (cadence, legacyStatus) => {
      const jobs = new FakeReaderSummaryJobRepository();
      const queue = new FakeReaderSummaryJobQueue();
      const publications = new InMemoryReaderSummaryArtifactRepository();
      let strategy: "legacy_v2" | "jev_primary_v3" = "legacy_v2";
      const useCase = new RequestReaderSummaryUseCase(
        jobs,
        queue,
        new AllowingSummaryQuota(),
        new SequenceIdGenerator(),
        new FixedClock(new Date("2026-07-06T08:00:00.000Z")),
        { resolve: () => strategy },
      );
      const command = {
        tenantId: tenantId("00000000-0000-7000-8000-000000000141"),
        workspaceId: workspaceId("00000000-0000-7000-8000-000000000142"),
        scope: { type: "workspace" as const },
        cadence,
        period: cadence === "daily"
          ? { startedAt: new Date("2026-07-05T00:00:00Z"), endedAt: new Date("2026-07-06T00:00:00Z"), timezone: "UTC" }
          : { startedAt: new Date("2026-06-29T00:00:00Z"), endedAt: new Date("2026-07-06T00:00:00Z"), timezone: "UTC" },
        idempotencyKey: `workspace-summary:${cadence}:period-1`,
        correlationId: "correlation-1",
      };
      const legacy = await useCase.execute(command);
      expect(legacy.ok).toBe(true);
      const originalJob = await jobs.findByIdempotencyKey(command);
      expect(originalJob).not.toBeNull();
      const running = originalJob!.start({ startedAt: new Date("2026-07-06T08:01:00Z") });
      const published = { completedAt: new Date("2026-07-06T08:02:00Z"), readerSummaryId: "legacy-publication" };
      await jobs.save(legacyStatus === "no_signal"
        ? running.markNoSignal(published) : running.complete(published));
      const publishedPeriod = originalJob!.toSnapshot().period;
      const publish = async (id: string): Promise<void> => {
        // Stage the publication handoff here; model and promotion execution
        // have separate tests and are outside this request boundary.
        const artifact = ReaderSummaryArtifact.create({
          ...readerSummaryArtifact(id).toSnapshot(),
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          period: publishedPeriod,
          promotionBoardState: "legacy_unavailable",
          ...(id === "legacy-publication" && legacyStatus === "no_signal" ? {
            content: undefined,
            topStories: [],
            qualityFlags: ["no_signal"] as const,
            noSignalReason: "No source evidence passed selection.",
            confidence: { level: "none" as const, score: 0,
              rationale: "No source evidence passed selection." },
          } : {}),
        });
        const audit = cadence === "daily" ? {
          schemaVersion: "reader_summary.github_projection.v1" as const,
          status: "not_required" as const,
          requestedUtcDay: "2026-07-05",
          pageCount: 0,
          scannedItemCount: 0,
          eligibleBindingIds: [],
          bindings: [],
          violationCodes: [],
          reasons: [],
          historicalOmission: {
            mode: "github_projection_unavailable_historical" as const,
            reason: "Historical fixture has no GitHub evidence",
            authorizedAt: "2026-07-06T08:00:00.000Z",
          },
        } : notApplicableReaderSummaryGitHubProjectionAudit({ artifact }).audit;
        await publications.save(artifact, { githubProjectionAudit: audit });
        publications.commitPublication(artifact);
      };
      const readPublished = async (): Promise<readonly string[]> =>
        (await publications.list({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          scope: command.scope,
          cadence,
          periodStartedAt: publishedPeriod.startedAt,
          periodEndedAt: publishedPeriod.endedAt,
          limit: 10,
        })).items.map((artifact) => artifact.toSnapshot().readerSummaryId);
      await publish("legacy-publication");
      expect(await readPublished()).toEqual(["legacy-publication"]);
      expect((await publications.listPeriodSummaries({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scope: command.scope,
        cadence,
        periodStartedAt: publishedPeriod.startedAt,
        periodEndedAt: publishedPeriod.endedAt,
        limit: 10,
      })).items).toEqual([
        expect.objectContaining({ readerSummaryId: "legacy-publication", status: legacyStatus }),
      ]);
      strategy = "jev_primary_v3";

      const normalRetry = await useCase.execute(command);
      expect(normalRetry).toEqual(expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ readerSummaryJobId: "reader-summary-job-1", created: false, status: legacyStatus }),
      }));
      const successorCommand = {
        ...command,
        idempotencyKey: `v3-successor:${command.idempotencyKey}`,
      };
      strategy = "legacy_v2";
      expect(await useCase.execute(successorCommand)).toEqual(expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          readerSummaryJobId: "reader-summary-job-1", created: false,
          status: legacyStatus,
        }),
      }));
      expect(queue.all()).toHaveLength(1);
      expect(await readPublished()).toEqual(["legacy-publication"]);
      strategy = "jev_primary_v3";
      const listSummaries = new ListReaderSummariesUseCase(publications, {
        evaluate: async () => ({
          status: "fresh", checkedAt: new Date("2026-07-06T08:03:00Z"),
        }),
      });
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(SUMMARY_AGENT_RUNTIME_CLIENT_OPTIONS)
        .useValue({ address: "127.0.0.1:0", timeoutMs: 1 })
        .overrideProvider(RequestReaderSummaryUseCase)
        .useValue(useCase)
        .overrideProvider(READER_SUMMARY_ARTIFACT_REPOSITORY)
        .useValue(publications)
        .overrideProvider(ListReaderSummariesUseCase)
        .useValue(listSummaries)
        .compile();
      const app: INestApplication = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({
        whitelist: true, forbidNonWhitelisted: true, transform: true,
      }));
      await app.init();
      try {
        const created = await request(app.getHttpServer())
          .post("/reader-summary-requests")
          .set("x-tenant-id", command.tenantId)
          .set("x-workspace-id", command.workspaceId)
          .set("x-workspace-role", "member")
          .set("idempotency-key", successorCommand.idempotencyKey)
          .send({ scope: command.scope, cadence,
            period: { startedAt: command.period.startedAt.toISOString(),
              endedAt: command.period.endedAt.toISOString(), timezone: "UTC" } })
          .expect(201);
        expect(created.body).toMatchObject({
          readerSummaryJobId: "reader-summary-job-2", created: true,
          status: "requested",
        });
        const successorJob = await jobs.findByIdempotencyKey(successorCommand);
        expect(successorJob?.toSnapshot().selectionStrategy).toBe("jev_primary_v3");
        await jobs.save(ReaderSummaryJob.rehydrate({
          ...successorJob!.toSnapshot(),
          status: "completed",
          readerSummaryId: "v3-publication",
          completedAt: new Date("2026-07-06T08:03:00Z"),
        }));
        await publish("v3-publication");
        expect(await readPublished()).toEqual(["v3-publication"]);
        const presented = await listSummaries.execute({
          tenantId: command.tenantId, workspaceId: command.workspaceId,
          scope: command.scope, cadence,
          periodStartedAt: publishedPeriod.startedAt,
          periodEndedAt: publishedPeriod.endedAt, limit: 10,
        });
        expect(presented.ok).toBe(true);
        if (presented.ok) {
          expect(listReaderSummariesResponseFromReaderSummaries(presented.value)
            .items).toHaveLength(1);
        }
        const replay = await request(app.getHttpServer())
          .post("/reader-summary-requests")
          .set("x-tenant-id", command.tenantId)
          .set("x-workspace-id", command.workspaceId)
          .set("x-workspace-role", "member")
          .set("idempotency-key", successorCommand.idempotencyKey)
          .send({ scope: command.scope, cadence,
            period: { startedAt: command.period.startedAt.toISOString(),
              endedAt: command.period.endedAt.toISOString(), timezone: "UTC" } })
          .expect(201);
        expect(replay.body).toMatchObject({
          readerSummaryJobId: "reader-summary-job-2", created: false,
          status: "completed",
        });
        const workspaceRead = await request(app.getHttpServer())
          .get("/reader-summaries")
          .query({ scopeType: "workspace", cadence,
            periodStartedAt: publishedPeriod.startedAt.toISOString(),
            periodEndedAt: publishedPeriod.endedAt.toISOString(), limit: 10 })
          .set("x-tenant-id", command.tenantId)
          .set("x-workspace-id", command.workspaceId)
          .set("x-workspace-role", "viewer")
          .expect(200);
        expect(workspaceRead.body.items).toEqual([
          expect.objectContaining({ readerSummaryId: "v3-publication" }),
        ]);
        strategy = "legacy_v2";
        expect(await useCase.execute(successorCommand)).toEqual(expect.objectContaining({
          ok: true,
          value: expect.objectContaining({ readerSummaryJobId: "reader-summary-job-2", created: false, status: "completed" }),
        }));
        expect(queue.all()).toHaveLength(2);
      } finally {
        await app.close();
      }
    },
  );

});

class FakeReaderSummaryJobRepository implements ReaderSummaryJobRepositoryPort {
  private readonly jobsById = new Map<string, ReaderSummaryJob>();
  private readonly jobsByIdempotencyKey = new Map<string, ReaderSummaryJob>();

  async save(job: ReaderSummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(snapshot.id, job);
    this.jobsByIdempotencyKey.set(snapshot.idempotencyKey, job);
  }

  async findById(
    params: Parameters<ReaderSummaryJobRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    const job = this.jobsById.get(params.readerSummaryJobId);
    return job?.toSnapshot().tenantId === params.tenantId &&
      job.toSnapshot().workspaceId === params.workspaceId
      ? job
      : null;
  }

  async findByIdempotencyKey(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["findByIdempotencyKey"]
    >[0],
  ): Promise<ReaderSummaryJob | null> {
    const job = this.jobsByIdempotencyKey.get(params.idempotencyKey);
    return job?.toSnapshot().tenantId === params.tenantId &&
      job.toSnapshot().workspaceId === params.workspaceId
      ? job
      : null;
  }

  async findRequested(
    params: Parameters<ReaderSummaryJobRepositoryPort["findRequested"]>[0],
  ): Promise<readonly ReaderSummaryJob[]> {
    return [...this.jobsById.values()]
      .filter((job) => {
        const snapshot = job.toSnapshot();
        return (
          snapshot.status === "requested" &&
          (params.tenantId === undefined ||
            snapshot.tenantId === params.tenantId) &&
          (params.workspaceId === undefined ||
            snapshot.workspaceId === params.workspaceId)
        );
      })
      .slice(0, params.limit);
  }

  async claimForExecution(): ReturnType<
    ReaderSummaryJobRepositoryPort["claimForExecution"]
  > {
    return null;
  }

  async saveExecutionOutcome(): Promise<boolean> {
    return false;
  }
}

class FakeReaderSummaryJobQueue implements ReaderSummaryJobQueuePort {
  private readonly commands: EnqueueReaderSummaryJobCommand[] = [];

  async canAccept(): Promise<boolean> {
    return true;
  }

  async enqueue(command: EnqueueReaderSummaryJobCommand): Promise<void> {
    this.commands.push(command);
  }

  all(): readonly EnqueueReaderSummaryJobCommand[] {
    return [...this.commands];
  }
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  readonly calls: Parameters<SummaryQuotaPort["reserveSummaryJob"]>[0][] = [];

  async reserveSummaryJob(
    command: Parameters<SummaryQuotaPort["reserveSummaryJob"]>[0],
  ): ReturnType<SummaryQuotaPort["reserveSummaryJob"]> {
    this.calls.push(command);

    return ok({
      remaining: 59,
      resetAt: "2026-06-23T09:00:00.000Z",
    });
  }
}
