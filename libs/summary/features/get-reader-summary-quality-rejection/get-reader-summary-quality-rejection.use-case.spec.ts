import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryJob } from "../../domain";
import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryRejectedArtifactDebug,
} from "../../ports";
import { GetReaderSummaryQualityRejectionUseCase } from "./get-reader-summary-quality-rejection.use-case";

const tenant = tenantId("tenant-reader-summary-quality-rejection");
const workspace = workspaceId("workspace-reader-summary-quality-rejection");

describe("GetReaderSummaryQualityRejectionUseCase", () => {
  it("returns safe rejection diagnostics for quality rejected jobs", async () => {
    const useCase = new GetReaderSummaryQualityRejectionUseCase(
      new FakeReaderSummaryJobRepository([
        qualityRejectedJob("reader-summary-job-rejected"),
      ]),
      new FakeReaderSummaryArtifactRepository(rejectionDebug()),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-summary-job-rejected",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        readerSummaryJobId: "reader-summary-job-rejected",
        readerSummaryId: "reader-summary-rejected-1",
        failureClass: "quality_rejected",
        canonicalScore: 0.21,
        reasonCodes: ["top_read_ineligible_source"],
        violations: [
          expect.objectContaining({
            code: "top_read_ineligible_source",
            citationId: "citation-1",
            feedItemId: "feed-1",
          }),
        ],
        shadow: {
          mode: "shadow",
          riskScore: 0.7,
          signals: [expect.objectContaining({ code: "single_source" })],
        },
      },
    });
  });

  it("does not return rejection diagnostics for non-rejected jobs", async () => {
    const useCase = new GetReaderSummaryQualityRejectionUseCase(
      new FakeReaderSummaryJobRepository([
        qualityRejectedJob("other-job"),
        completedJob("reader-summary-job-completed"),
      ]),
      new FakeReaderSummaryArtifactRepository(rejectionDebug()),
    );

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      readerSummaryJobId: "reader-summary-job-completed",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation.failed" }),
    });
  });
});

const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-07-05T00:00:00.000Z"),
  endedAt: new Date("2026-07-06T00:00:00.000Z"),
  timezone: "UTC",
  periodKey:
    "daily:2026-07-05T00:00:00.000Z:2026-07-06T00:00:00.000Z:UTC",
};

const qualityRejectedJob = (id: string): ReaderSummaryJob =>
  ReaderSummaryJob.rehydrate({
    id,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period,
    status: "quality_rejected",
    idempotencyKey: `${id}:idempotency`,
    requestedAt: new Date("2026-07-05T08:00:00.000Z"),
    startedAt: new Date("2026-07-05T08:01:00.000Z"),
    failedAt: new Date("2026-07-05T08:02:00.000Z"),
    readerSummaryId: "reader-summary-rejected-1",
    failureReason: "Reader summary artifact failed pre-publish quality gate.",
  });

const completedJob = (id: string): ReaderSummaryJob =>
  ReaderSummaryJob.rehydrate({
    id,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period,
    status: "completed",
    idempotencyKey: `${id}:idempotency`,
    requestedAt: new Date("2026-07-05T08:00:00.000Z"),
    startedAt: new Date("2026-07-05T08:01:00.000Z"),
    completedAt: new Date("2026-07-05T08:02:00.000Z"),
    readerSummaryId: "reader-summary-completed-1",
  });

const rejectionDebug = (): ReaderSummaryRejectedArtifactDebug => ({
  tenantId: tenant,
  workspaceId: workspace,
  readerSummaryId: "reader-summary-rejected-1",
  scope: { type: "workspace" },
  period,
  headline: "Rejected reader summary",
  canonicalScore: 0.21,
  shadow: {
    mode: "shadow",
    riskScore: 0.7,
    signals: [
      {
        code: "single_source",
        score: 0.7,
        reason: "Selected evidence comes from a single provider family.",
      },
    ],
  },
  reasonCodes: ["top_read_ineligible_source"],
  reasons: ["Top read references ineligible evidence."],
  violations: [
    {
      code: "top_read_ineligible_source",
      reason: "Top read references ineligible evidence.",
      topReadTitle: "Rumor-only launch post",
      citationId: "citation-1",
      feedItemId: "feed-1",
      sourceItemId: "source-1",
      providerKey: "reddit",
      canonicalUrl: "https://reddit.example.test/post",
    },
  ],
  topReads: [
    {
      title: "Rumor-only launch post",
      providerKey: "reddit",
      canonicalUrl: "https://reddit.example.test/post",
      citationIds: ["citation-1"],
    },
  ],
  citations: [
    {
      citationId: "citation-1",
      feedItemId: "feed-1",
      sourceItemId: "source-1",
      providerKey: "reddit",
      canonicalUrl: "https://reddit.example.test/post",
    },
  ],
});

class FakeReaderSummaryJobRepository implements ReaderSummaryJobRepositoryPort {
  constructor(private readonly jobs: readonly ReaderSummaryJob[]) {}

  async save(): Promise<void> {}

  async findById(
    params: Parameters<ReaderSummaryJobRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    return (
      this.jobs.find((job) => {
        const snapshot = job.toSnapshot();
        return (
          snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.id === params.readerSummaryJobId
        );
      }) ?? null
    );
  }

  async findByIdempotencyKey(): Promise<ReaderSummaryJob | null> {
    return null;
  }

  async findRequested(): Promise<readonly ReaderSummaryJob[]> {
    return [];
  }

  async claimForExecution(): Promise<ReaderSummaryJob | null> {
    return null;
  }
}

class FakeReaderSummaryArtifactRepository
  implements ReaderSummaryArtifactRepositoryPort
{
  constructor(private readonly debug: ReaderSummaryRejectedArtifactDebug) {}

  async save(): Promise<void> {}

  async list(): ReturnType<ReaderSummaryArtifactRepositoryPort["list"]> {
    return { items: [] };
  }

  async listPeriodSummaries(): ReturnType<
    ReaderSummaryArtifactRepositoryPort["listPeriodSummaries"]
  > {
    return { items: [] };
  }

  async findById(): ReturnType<ReaderSummaryArtifactRepositoryPort["findById"]> {
    return null;
  }

  async findRejectedDebugById(
    params: Parameters<
      ReaderSummaryArtifactRepositoryPort["findRejectedDebugById"]
    >[0],
  ): Promise<ReaderSummaryRejectedArtifactDebug | null> {
    return params.readerSummaryId === this.debug.readerSummaryId
      ? this.debug
      : null;
  }
}
