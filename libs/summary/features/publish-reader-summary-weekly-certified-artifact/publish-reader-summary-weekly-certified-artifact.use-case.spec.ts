import type { ReaderSummaryWeeklyCertificationSealAuthorityPort } from "../../ports/reader-summary-weekly-certification-seal-authority.port";
import type { ReaderSummaryWeeklyStoryAuthorityPort } from "../../ports/reader-summary-weekly-story-authority.port";
import type { ReaderSummaryWeeklyPublicationAuthorization } from "../../domain/policies/reader-summary-weekly-publication-authorization";
import * as publicationAuthorization from "../../domain/policies/reader-summary-weekly-publication-authorization";
import {
  PublishReaderSummaryWeeklyCertifiedArtifactUseCase,
  readerSummaryWeeklyCertifiedArtifactId,
} from "./publish-reader-summary-weekly-certified-artifact.use-case";

describe("publish weekly certified artifact use case", () => {
  it("derives one stable RFC-shaped UUID from immutable seal hash", () => {
    const sha = "0123456789abcdef".repeat(4);
    const first = readerSummaryWeeklyCertifiedArtifactId(sha);
    const second = readerSummaryWeeklyCertifiedArtifactId(sha);
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    expect(first.ok && first.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it("performs no save or strict read when the DB seal is missing", async () => {
    const sealAuthority = {
      load: jest.fn(async () => null),
      readVerifiedBinding: jest.fn(),
    } as unknown as ReaderSummaryWeeklyCertificationSealAuthorityPort;
    const storyAuthority = {
      load: jest.fn(),
      readVerifiedBinding: jest.fn(),
    } as unknown as ReaderSummaryWeeklyStoryAuthorityPort;
    const saveWeekly = jest.fn();
    const findWeeklyById = jest.fn();
    const useCase = new PublishReaderSummaryWeeklyCertifiedArtifactUseCase(
      sealAuthority,
      storyAuthority,
      { saveWeekly, findWeeklyById },
    );
    const result = await useCase.execute({
      artifact: Object.freeze({}) as never,
      modelInput: {
        tenantId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
        scope: { type: "workspace" },
        weekStartedOn: "2026-07-20",
      } as never,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("resource.not_found");
    expect(storyAuthority.load).not.toHaveBeenCalled();
    expect(saveWeekly).not.toHaveBeenCalled();
    expect(findWeeklyById).not.toHaveBeenCalled();
  });

  it("loads all seven authorities, saves, and verifies the strict weekly row", async () => {
    const seal = useCaseSeal();
    const sealHandle = Object.freeze({});
    const storyHandles = seal.days.map(() => Object.freeze({}));
    const sealAuthority = {
      load: jest.fn(async () => sealHandle),
      readVerifiedBinding: jest.fn(() => seal),
    } as unknown as ReaderSummaryWeeklyCertificationSealAuthorityPort;
    const storyAuthority = {
      load: jest.fn(async ({ publicationId }: { publicationId: string }) =>
        storyHandles[seal.days.findIndex(
          (day) => day.publicationId === publicationId,
        )]),
      readVerifiedBinding: jest.fn(),
    } as unknown as ReaderSummaryWeeklyStoryAuthorityPort;
    const authorization = Object.freeze(
      {},
    ) as ReaderSummaryWeeklyPublicationAuthorization;
    const authorize = jest.spyOn(
      publicationAuthorization,
      "authorizeReaderSummaryWeeklyCertifiedPublication",
    ).mockReturnValue(authorization);
    const saveWeekly = jest.fn(async () => undefined);
    const findWeeklyById = jest.fn(async () => Object.freeze({}));
    const useCase = new PublishReaderSummaryWeeklyCertifiedArtifactUseCase(
      sealAuthority,
      storyAuthority,
      { saveWeekly, findWeeklyById: findWeeklyById as never },
    );

    const result = await useCase.execute(useCaseCommand());

    expect(result.ok).toBe(true);
    expect(storyAuthority.load).toHaveBeenCalledTimes(7);
    expect(storyAuthority.load).toHaveBeenNthCalledWith(1, {
      tenantId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      publicationId: seal.days[0]!.publicationId,
    });
    expect(saveWeekly).toHaveBeenCalledWith({
      kind: "weekly",
      artifactId: result.ok ? result.value.artifactId : "unreachable",
      authorization,
    });
    expect(findWeeklyById).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: result.ok ? result.value.artifactId : "unreachable",
      }),
    );
    authorize.mockRestore();
  });

  it("fails closed when the strict weekly row is absent after save", async () => {
    const seal = useCaseSeal();
    const sealHandle = Object.freeze({});
    const sealAuthority = {
      load: jest.fn(async () => sealHandle),
      readVerifiedBinding: jest.fn(() => seal),
    } as unknown as ReaderSummaryWeeklyCertificationSealAuthorityPort;
    const storyAuthority = {
      load: jest.fn(async () => Object.freeze({})),
      readVerifiedBinding: jest.fn(),
    } as unknown as ReaderSummaryWeeklyStoryAuthorityPort;
    const authorize = jest.spyOn(
      publicationAuthorization,
      "authorizeReaderSummaryWeeklyCertifiedPublication",
    ).mockReturnValue(
      Object.freeze({}) as ReaderSummaryWeeklyPublicationAuthorization,
    );
    const saveWeekly = jest.fn(async () => undefined);
    const findWeeklyById = jest.fn(async () => null);
    const useCase = new PublishReaderSummaryWeeklyCertifiedArtifactUseCase(
      sealAuthority,
      storyAuthority,
      { saveWeekly, findWeeklyById },
    );

    try {
      const result = await useCase.execute(useCaseCommand());

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe(
        "external.dependency_unavailable",
      );
      expect(saveWeekly).toHaveBeenCalledTimes(1);
      expect(findWeeklyById).toHaveBeenCalledTimes(1);
    } finally {
      authorize.mockRestore();
    }
  });

  it("performs no save when the loaded DB seal authority diverges", async () => {
    const sealAuthority = {
      load: jest.fn(async () => Object.freeze({})),
      readVerifiedBinding: jest.fn(() => {
        throw new Error("stale seal");
      }),
    } as unknown as ReaderSummaryWeeklyCertificationSealAuthorityPort;
    const saveWeekly = jest.fn();
    const useCase = new PublishReaderSummaryWeeklyCertifiedArtifactUseCase(
      sealAuthority,
      { load: jest.fn(), readVerifiedBinding: jest.fn() },
      { saveWeekly, findWeeklyById: jest.fn() },
    );
    const result = await useCase.execute({
      artifact: Object.freeze({}) as never,
      modelInput: {
        tenantId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
        scope: { type: "workspace" },
        weekStartedOn: "2026-07-20",
      } as never,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("authorization.denied");
    expect(saveWeekly).not.toHaveBeenCalled();
  });
});

const useCaseCommand = () => ({
  artifact: Object.freeze({}) as never,
  modelInput: {
    tenantId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    scope: { type: "workspace" as const },
    weekStartedOn: "2026-07-20",
  } as never,
});

const useCaseSeal = () => ({
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  sealSha: "0123456789abcdef".repeat(4),
  days: Array.from({ length: 7 }, (_, index) => ({
    publicationId: `publication:${index}`,
  })),
});
