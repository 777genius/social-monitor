import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryPeriod,
  type ReaderSummaryArtifact,
} from "../../domain";
import type {
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ListReaderSummaryPeriodSummariesResult,
  ReaderSummaryArtifactRepositoryPort,
} from "../../ports";
import { ListReaderSummaryPeriodsUseCase } from "./list-reader-summary-periods.use-case";

describe("ListReaderSummaryPeriodsUseCase", () => {
  it("lists lightweight reader summary period summaries", async () => {
    const repository = new FakeReaderSummaryArtifactRepository({
      items: [
        {
          tenantId: tenant,
          workspaceId: workspace,
          readerSummaryId: "11111111-1111-4111-8111-111111111111",
          scope: { type: "workspace" },
          period: buildReaderSummaryPeriod({
            cadence: "daily",
            startedAt: new Date("2026-07-03T00:00:00.000Z"),
            endedAt: new Date("2026-07-04T00:00:00.000Z"),
            timezone: "UTC",
          }),
          headline: "Fable 5 dominates AI developer chatter",
          status: "completed",
        },
      ],
    });
    const useCase = new ListReaderSummaryPeriodsUseCase(repository);

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      cadence: "daily",
      timezone: "UTC",
      limit: 20,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          expect.objectContaining({
            readerSummaryId: "11111111-1111-4111-8111-111111111111",
            headline: "Fable 5 dominates AI developer chatter",
          }),
        ],
        nextCursor: undefined,
      },
    });
    expect(repository.periodQueries).toEqual([
      expect.objectContaining({ cadence: "daily", limit: 20 }),
    ]);
    expect(repository.fullQueries).toEqual([]);
  });

  it("rejects invalid limits before reading repository", async () => {
    const repository = new FakeReaderSummaryArtifactRepository({ items: [] });
    const useCase = new ListReaderSummaryPeriodsUseCase(repository);

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 101,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation.failed" }),
    });
    expect(repository.periodQueries).toEqual([]);
  });
});

const tenant = tenantId("11111111-1111-4111-8111-111111111111");
const workspace = workspaceId("22222222-2222-4222-8222-222222222222");

class FakeReaderSummaryArtifactRepository implements ReaderSummaryArtifactRepositoryPort {
  readonly fullQueries: ListReaderSummaryArtifactsQuery[] = [];
  readonly periodQueries: ListReaderSummaryArtifactsQuery[] = [];

  constructor(
    private readonly periodResult: ListReaderSummaryPeriodSummariesResult,
  ) {}

  async save(artifact: ReaderSummaryArtifact): Promise<void> {
    void artifact;
  }

  async list(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryArtifactsResult> {
    this.fullQueries.push(query);

    return { items: [] };
  }

  async listPeriodSummaries(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryPeriodSummariesResult> {
    this.periodQueries.push(query);

    return this.periodResult;
  }

  async findById(): Promise<ReaderSummaryArtifact | null> {
    return null;
  }

  async findRejectedDebugById(): Promise<null> {
    return null;
  }
}
