import {
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryContextProviderPort,
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryModelPort,
  ReaderSummaryPolicyRepositoryPort,
  SummaryEventPublisherPort,
} from "../../ports";
import { ExecuteReaderSummaryJobUseCase } from "./execute-reader-summary-job.use-case";

class StaticIdGenerator implements IdGenerator {
  generate(): string {
    return "reader-summary-id-1";
  }
}

describe("ExecuteReaderSummaryJobUseCase", () => {
  it("rejects empty reader summary job ids with canonical language", async () => {
    const useCase = new ExecuteReaderSummaryJobUseCase(
      unused<ReaderSummaryJobRepositoryPort>(),
      unused<ReaderSummaryArtifactRepositoryPort>(),
      unused<ReaderSummaryPolicyRepositoryPort>(),
      unused<ReaderSummaryEvidenceSelectorPort>(),
      unused<ReaderSummaryModelPort>(),
      unused<SummaryEventPublisherPort>(),
      new StaticIdGenerator(),
      new FixedClock(new Date("2026-06-23T08:31:00.000Z")),
      unused<ReaderSummaryContextProviderPort>(),
    );

    const result = await useCase.execute({
      tenantId: tenantId("tenant-reader-summary-use-case"),
      workspaceId: workspaceId("workspace-reader-summary-use-case"),
      readerSummaryJobId: "   ",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "validation.failed",
        message: "Reader summary job id must be non-empty",
      }),
    });
  });
});

const unused = <T>(): T => ({}) as T;
