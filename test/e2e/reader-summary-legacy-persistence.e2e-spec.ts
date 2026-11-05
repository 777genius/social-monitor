import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryArtifact } from "@social-monitor/summary/domain";
import { PrismaReaderSummaryArtifactRepository } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { readerSummaryArtifact } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact-fixture.spec-support";
import { FakeReaderSummaryPrisma } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository.spec-support";
import { serializeReaderSummaryArtifact } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-json";
import { READER_SUMMARY_ARTIFACT_REPOSITORY } from
  "@social-monitor/summary/interfaces/rest/summary-provider-tokens";
import request from "supertest";

import { AppModule } from "../../apps/api-gateway/src/app.module";

const tenant = tenantId("00000000-0000-7000-8000-000000000741");
const workspace = workspaceId("00000000-0000-7000-8000-000000000742");
const legacyId = "reader-summary-legacy-persisted";
const currentId = "reader-summary-current-no-signal";

describe("Reader summary legacy persistence REST compatibility (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const prisma = new FakeReaderSummaryPrisma();
    const repository = new PrismaReaderSummaryArtifactRepository(prisma.client);
    const legacy = legacyArtifact();
    await repository.save(legacy, notApplicableProjection(legacy));
    prisma.replaceArtifactPayload(legacyId, prePromotionPersistedPayload(legacy));
    prisma.publish(legacyId);

    const current = currentNoSignalArtifact();
    await repository.save(current, notApplicableProjection(current));
    prisma.publish(currentId);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(READER_SUMMARY_ARTIFACT_REPOSITORY)
      .useValue(repository)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.init();
  });

  afterAll(async () => app.close());

  it("returns legacy detail with an unavailable promotion board", async () => {
    const response = await readerRequest(`/reader-summaries/${legacyId}`)
      .expect(200);

    expect(response.body).toMatchObject({
      readerSummaryId: legacyId,
      headline: "Reader source signal",
      executiveSummary: "A reader source signal was selected.",
      readerBrief: {
        oneLineTakeaway: "A reader source signal was selected.",
        topReads: [],
        selectedPosts: [],
      },
    });
    expect(response.body).not.toHaveProperty("promotionBoardState");
  });

  it("keeps list usable when one persisted artifact is pre-promotion", async () => {
    const response = await readerRequest("/reader-summaries")
      .query({ limit: 10 })
      .expect(200);

    expect(response.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ readerSummaryId: currentId }),
      expect.objectContaining({
        readerSummaryId: legacyId,
        readerBrief: expect.objectContaining({
          topReads: [],
          selectedPosts: [],
        }),
      }),
    ]));
    expect(response.body.items).toHaveLength(2);
  });

  const readerRequest = (path: string) => request(app.getHttpServer())
    .get(path)
    .set("x-tenant-id", tenant)
    .set("x-workspace-id", workspace)
    .set("x-workspace-role", "viewer");
});

const prePromotionPersistedPayload = (
  artifact: ReaderSummaryArtifact,
): Record<string, unknown> => {
  const payload = JSON.parse(JSON.stringify(
    serializeReaderSummaryArtifact(artifact),
  )) as Record<string, unknown>;
  delete payload.promotionAttestations;
  delete payload.promotionEvidenceFacts;
  delete payload.promotionBoardState;
  return payload;
};

const legacyArtifact = (): ReaderSummaryArtifact => {
  const snapshot = readerSummaryArtifact(legacyId).toSnapshot();
  return ReaderSummaryArtifact.create({ ...snapshot, tenantId: tenant, workspaceId: workspace });
};

const currentNoSignalArtifact = (): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: currentId,
    tenantId: tenant,
    workspaceId: workspace,
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt: new Date("2026-07-04T00:00:00.000Z"),
      endedAt: new Date("2026-07-05T00:00:00.000Z"),
      timezone: "UTC",
      periodKey:
        "daily:2026-07-04T00:00:00.000Z:2026-07-05T00:00:00.000Z:UTC",
    },
    sourceWindow: {
      windowId: "reader-window-current",
      startedAt: new Date("2026-07-04T08:00:00.000Z"),
      endedAt: new Date("2026-07-04T09:00:00.000Z"),
      selectedFeedItemIds: [],
      storyClusterIds: [],
    },
    storyClusters: [],
    contextArtifacts: [],
    headline: "No current reader signal",
    executiveSummary: "No eligible evidence was selected.",
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [],
    qualityFlags: ["no_signal"],
    confidence: {
      level: "none",
      score: 0,
      rationale: "No eligible evidence was selected.",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "deterministic-test",
      providerVersion: "local",
      rulesVersion: "reader-summary.rules.v1",
      evalDatasetVersion: "reader-summary.eval.v1",
    },
    usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
    noSignalReason: "No eligible evidence was selected.",
  });

const notApplicableProjection = (artifact: ReaderSummaryArtifact) => ({
  githubProjectionAudit: {
    schemaVersion: "reader_summary.github_projection.v1" as const,
    status: "not_applicable" as const,
    requestedUtcDay: artifact.toSnapshot().period.periodKey,
    pageCount: 0,
    scannedItemCount: 0,
    eligibleBindingIds: [],
    bindings: [],
    violationCodes: [],
    reasons: [],
  },
});
