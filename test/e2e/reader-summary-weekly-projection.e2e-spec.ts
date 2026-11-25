import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type {
  PersistedReaderSummaryWeeklyArtifact,
  ReaderSummaryWeeklyProjectionReaderPort,
} from "@social-monitor/summary/ports";
import { READER_SUMMARY_WEEKLY_PROJECTION_READER } from "@social-monitor/summary/interfaces/rest/summary-provider-tokens";
import request from "supertest";

import { AppModule } from "../../apps/api-gateway/src/app.module";

const tenant = tenantId("00000000-0000-7000-8000-000000000731");
const workspace = workspaceId("00000000-0000-7000-8000-000000000732");
const weekStartedOn = "2026-07-20";
const dates = Array.from({ length: 7 }, (_, index) =>
  new Date(Date.parse(`${weekStartedOn}T00:00:00.000Z`) + index * 86_400_000)
    .toISOString().slice(0, 10),
);

describe("Reader summary weekly projection REST (e2e)", () => {
  let app: INestApplication;
  let reader: FakeWeeklyProjectionReader;

  beforeAll(async () => {
    reader = new FakeWeeklyProjectionReader();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(READER_SUMMARY_WEEKLY_PROJECTION_READER)
      .useValue(reader)
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

  beforeEach(() => reader.reset());

  it("returns unavailable only when both certified evidence and artifact are absent", async () => {
    const response = await getProjection().expect(200);

    expect(response.body).toEqual({
      schemaVersion: "reader_summary.weekly_projection.v1",
      tenantId: tenant,
      workspaceId: workspace,
      weekStartedOn,
      weekEndedOn: "2026-07-26",
      status: "unavailable",
      certifiedDailyEvidenceDates: [],
      missingDailyEvidenceDates: dates,
      blockingReasons: [
        "certified_daily_evidence_incomplete",
        "active_weekly_certified_artifact_missing",
      ],
      activeWeeklyCertifiedArtifactPresent: false,
      evidenceLimitations: [],
      artifact: null,
    });
  });

  it("returns partial instead of 500 when a valid weekly slot has no publication", async () => {
    reader.certifiedDailyEvidenceDates = dates;

    const response = await getProjection().expect(200);

    expect(response.body).toMatchObject({
      status: "partial",
      certifiedDailyEvidenceDates: dates,
      missingDailyEvidenceDates: [],
      blockingReasons: ["active_weekly_certified_artifact_missing"],
      activeWeeklyCertifiedArtifactPresent: false,
      evidenceLimitations: [],
      artifact: null,
    });
  });

  it("discloses historical evidence limits while withholding an active artifact", async () => {
    reader.certifiedDailyEvidenceDates = dates.slice(0, 6);
    reader.artifact = weeklyArtifact();
    reader.evidenceLimitations = [{
      requestedUtcDate: dates[1]!,
      providerKey: "github-trending-page",
      evidenceState: "historical_unavailable",
    }];

    const response = await getProjection().expect(200);

    expect(response.body).toMatchObject({
      status: "partial",
      blockingReasons: ["certified_daily_evidence_incomplete"],
      activeWeeklyCertifiedArtifactPresent: true,
      evidenceLimitations: [{
        requestedUtcDate: dates[1],
        providerKey: "github-trending-page",
        evidenceState: "historical_unavailable",
      }],
      artifact: null,
    });
    expect(JSON.stringify(response.body)).not.toContain(
      "active_weekly_certified_artifact_missing",
    );
  });

  it("returns the separate complete weekly contract without sourceWindow", async () => {
    reader.certifiedDailyEvidenceDates = dates;
    reader.artifact = weeklyArtifact();

    const response = await getProjection().expect(200);

    expect(response.body).toMatchObject({
      schemaVersion: "reader_summary.weekly_projection.v1",
      status: "complete",
      certifiedDailyEvidenceDates: dates,
      missingDailyEvidenceDates: [],
      blockingReasons: [],
      activeWeeklyCertifiedArtifactPresent: true,
      evidenceLimitations: [],
      artifact: {
        artifactId: "00000000-0000-7000-8000-000000000739",
        schemaVersion: "reader_summary.weekly_model_output.v1",
        headline: "Certified weekly headline",
        publicationProofSha256: "f".repeat(64),
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("sourceWindow");
    expect(reader.queries).toEqual([{
      tenantId: tenant,
      workspaceId: workspace,
      weekStartedOn,
      weekEndedOn: "2026-07-26",
    }]);
  });

  it("rejects missing, malformed, and non-Monday query dates", async () => {
    for (const query of [{}, { weekStartedOn: "2026-7-20" }, {
      weekStartedOn: "2026-07-21",
    }]) {
      const response = await request(app.getHttpServer())
        .get("/reader-summaries/weekly")
        .query(query)
        .set("x-tenant-id", tenant)
        .set("x-workspace-id", workspace)
        .set("x-workspace-role", "viewer")
        .expect(400);
      expect(response.body).toMatchObject({ code: "validation.failed" });
    }
    expect(reader.queries).toEqual([]);
  });

  it("keeps tenant scope mandatory and turns reader failures into HTTP failures", async () => {
    await request(app.getHttpServer())
      .get("/reader-summaries/weekly")
      .query({ weekStartedOn })
      .set("x-workspace-id", workspace)
      .set("x-workspace-role", "viewer")
      .expect(400);

    reader.failure = new Error("database integrity failure");
    const response = await getProjection().expect(500);
    expect(response.body.status).not.toBe("unavailable");
  });

  const getProjection = () => request(app.getHttpServer())
    .get("/reader-summaries/weekly")
    .query({ weekStartedOn })
    .set("x-tenant-id", tenant)
    .set("x-workspace-id", workspace)
    .set("x-workspace-role", "viewer");
});

class FakeWeeklyProjectionReader
  implements ReaderSummaryWeeklyProjectionReaderPort
{
  certifiedDailyEvidenceDates: readonly string[] = [];
  artifact: PersistedReaderSummaryWeeklyArtifact | null = null;
  evidenceLimitations: readonly {
    requestedUtcDate: string;
    providerKey: "github-trending-page";
    evidenceState: "historical_unavailable";
  }[] = [];
  failure: Error | null = null;
  readonly queries: Parameters<ReaderSummaryWeeklyProjectionReaderPort["read"]>[0][] = [];

  reset(): void {
    this.certifiedDailyEvidenceDates = [];
    this.artifact = null;
    this.evidenceLimitations = [];
    this.failure = null;
    this.queries.splice(0);
  }

  async read(
    query: Parameters<ReaderSummaryWeeklyProjectionReaderPort["read"]>[0],
  ) {
    this.queries.push(query);
    if (this.failure !== null) throw this.failure;
    return {
      certifiedDailyEvidenceDates: this.certifiedDailyEvidenceDates,
      activeWeeklyCertifiedArtifactPresent: this.artifact !== null,
      evidenceLimitations: this.evidenceLimitations,
      artifact: this.artifact,
    };
  }
}

const weeklyArtifact = (): PersistedReaderSummaryWeeklyArtifact => ({
  kind: "weekly",
  artifactId: "00000000-0000-7000-8000-000000000739",
  tenantId: tenant,
  workspaceId: workspace,
  artifact: {
    output: {
      schemaVersion: "reader_summary.weekly_model_output.v1",
      sealId: `reader_summary.weekly_model_input.v1:${"a".repeat(64)}`,
      sealSha: "a".repeat(64),
      weekStartedOn,
      weekEndedOn: "2026-07-26",
      headline: "Certified weekly headline",
      headlineCitationIds: ["citation-1"],
      takeaway: "Certified weekly takeaway",
      takeawayCitationIds: ["citation-1"],
      synthesis: "Certified weekly synthesis",
      synthesisCitationIds: ["citation-1"],
      stories: [{
        storyId: "story-1",
        headline: "Weekly story",
        summary: "Weekly story summary",
        status: "new",
        observedFrom: weekStartedOn,
        observedThrough: weekStartedOn,
        citationIds: ["citation-1"],
      }],
      sections: [{
        sectionId: "section-1",
        storyId: "story-1",
        kind: "lead",
        claimType: "snapshot",
        heading: "Weekly section",
        text: "Weekly section text",
        observedFrom: weekStartedOn,
        observedThrough: weekStartedOn,
        citationIds: ["citation-1"],
      }],
    },
    editorialQuality: {} as never,
  },
  qualitySignals: {} as never,
  proof: {
    authorizationId: `reader_summary.weekly_publication_authorization.v1:${"f".repeat(64)}`,
    sha256: "f".repeat(64),
    modelInputSealId: `reader_summary.weekly_model_input.v1:${"a".repeat(64)}`,
    modelInputSealSha256: "a".repeat(64),
    artifactSha256: "b".repeat(64),
    editorialQualitySha256: "c".repeat(64),
    citations: [{
      citationId: "citation-1",
      requestedUtcDate: weekStartedOn,
      publicationId: "00000000-0000-7000-8000-000000000738",
      publicationEvidenceIdentity: `evidence:${"d".repeat(64)}`,
      providerKey: "reddit",
      feedItemId: "feed-1",
      sourceItemId: "source-1",
      sourceBindingId: "binding-1",
      providerItemId: "provider-1",
      canonicalUrl: "https://example.test/weekly-story",
      sourceContentHash: "e".repeat(64),
    }],
  } as never,
});
