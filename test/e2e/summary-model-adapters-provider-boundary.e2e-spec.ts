import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { OpenAiResponsesSummaryModelAdapter } from "@social-monitor/summary/adapters/model/openai-responses-summary-model.adapter";
import { MeteredSummaryModelAdapter } from "@social-monitor/summary/adapters/model/metered-summary-model.adapter";
import { InMemorySummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository";
import { InMemorySummaryEventPublisher } from "@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher";
import { InMemorySummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-summary-job.repository";
import { ExecuteSummaryJobUseCase } from "@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case";
import { SUMMARY_EVIDENCE_SELECTOR } from "@social-monitor/summary/interfaces/rest/summary-provider-tokens";
import type {
  SummaryEvidenceSelection,
  SummaryEvidenceSelectorPort,
} from "@social-monitor/summary/ports";
import request from "supertest";

import { AppModule } from "../../apps/api-gateway/src/app.module";
import { deterministicTestUuid } from "./support/deterministic-test-uuid";

const tenant = tenantId(deterministicTestUuid("model-boundary-tenant"));
const workspace = workspaceId(deterministicTestUuid("model-boundary-workspace"));
const now = new Date("2026-06-21T10:00:00.000Z");

const evidence: SummaryEvidenceSelection = {
  sourceWindow: {
    windowId: "synthetic-model-boundary",
    startedAt: new Date("2026-06-21T09:00:00.000Z"),
    endedAt: now,
    selectedFeedItemIds: ["feed-1", "feed-2"],
  },
  items: [
    {
      feedItemId: "feed-1",
      sourceItemId: "source-1",
      sourceBindingId: "binding-1",
      providerKey: "reddit",
      title: "Verified summary evidence",
      bodyPreview: "Synthetic source text for an end-to-end model boundary test.",
      canonicalUrl: "https://example.test/reddit/verified",
      observedAt: now,
    },
    {
      feedItemId: "feed-2",
      sourceItemId: "source-2",
      sourceBindingId: "binding-2",
      providerKey: "github",
      title: "Second independent source",
      bodyPreview: "Synthetic second source, with no credentials or model calls.",
      canonicalUrl: "https://example.test/github/verified",
      observedAt: now,
    },
  ],
};

const providerDraft = () => ({
  headline: "Verified summary evidence",
  executiveSummary: "Two independent synthetic sources support this summary.",
  keyPoints: [{ claim: "A verified source was selected.", citationIds: ["c1"] }],
  risksAndUnknowns: [{
    description: "A second source should be monitored.",
    citationIds: ["c2"],
    reason: "source_limit",
  }],
  sourceHighlights: ["Two independent synthetic sources"],
  citationMap: [
    { citationId: "c1", feedItemId: "invented-feed", sourceItemId: "invented",
      providerKey: "invented", field: "title" },
    { citationId: "c2", feedItemId: "invented-feed", sourceItemId: "invented",
      providerKey: "invented", field: "bodyPreview" },
  ],
  qualityFlags: ["limited_sources"],
  confidence: { level: "medium", score: 0.62,
    rationale: "Two independently supplied fixtures." },
  noSignalReason: null,
});

describe("OpenAI model adapter through REST, use case and storage (e2e)", () => {
  let app: INestApplication;
  const calls: string[] = [];
  let responseMode: "valid" | "malformed" = "valid";
  const metrics = new InMemoryMetricsRecorder();

  beforeAll(async () => {
    const selector: SummaryEvidenceSelectorPort = {
      select: async (params) => {
        if (params.tenantId !== tenant || params.workspaceId !== workspace) {
          throw new Error("Synthetic evidence cannot cross tenant scope");
        }
        return evidence;
      },
    };
    const provider = new OpenAiResponsesSummaryModelAdapter({
      apiKey: "fixture",
      model: "synthetic-openai-summary",
      fetchFn: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { readonly input: string };
        calls.push(body.input);
        return new Response(JSON.stringify({
          output_text: responseMode === "valid"
            ? JSON.stringify(providerDraft())
            : "{invalid-json",
        }), { status: 200 });
      },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SUMMARY_EVIDENCE_SELECTOR)
      .useValue(selector)
      .overrideProvider(MeteredSummaryModelAdapter)
      .useValue(new MeteredSummaryModelAdapter(provider, metrics))
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
    }));
    await app.init();
  });

  afterAll(async () => app.close());

  const requestJob = async (interestId: string) => request(app.getHttpServer())
    .post("/interests/" + interestId + "/summary-requests")
    .set("x-tenant-id", tenant)
    .set("x-workspace-id", workspace)
    .set("x-workspace-role", "member")
    .set("x-request-id", interestId)
    .set("idempotency-key", interestId)
    .expect(201);

  it("rebinds fabricated provider citations and publishes only scoped evidence", async () => {
    responseMode = "valid";
    const requested = await requestJob("model-e2e-valid");
    const summaryJobId = requested.body.summaryJobId as string;
    const result = await app.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenant, workspaceId: workspace, summaryJobId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.summaryId === undefined) {
      throw new Error("Expected completed summary with a persisted artifact");
    }
    expect(result.value.status).toBe("completed");
    const artifact = await app.get(InMemorySummaryArtifactRepository).findById({
      tenantId: tenant, workspaceId: workspace, summaryId: result.value.summaryId,
    });
    const snapshot = artifact?.toSnapshot();
    expect(snapshot).toMatchObject({
      tenantId: tenant,
      workspaceId: workspace,
      lineage: { providerVersion: "openai-responses", modelVersion: "synthetic-openai-summary" },
      citationMap: [
        { citationId: "c1", feedItemId: "feed-1", sourceItemId: "source-1",
          providerKey: "reddit", canonicalUrl: "https://example.test/reddit/verified" },
        { citationId: "c2", feedItemId: "feed-2", sourceItemId: "source-2",
          providerKey: "github", canonicalUrl: "https://example.test/github/verified" },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain("invented-feed");
    const detail = await request(app.getHttpServer())
      .get("/summaries/" + result.value.summaryId)
      .set("x-tenant-id", tenant)
      .set("x-workspace-id", workspace)
      .set("x-workspace-role", "viewer")
      .expect(200);
    expect(detail.body).toMatchObject({
      summaryId: result.value.summaryId,
      tenantId: tenant,
      workspaceId: workspace,
      citations: [
        { citationId: "c1", feedItemId: "feed-1", sourceItemId: "source-1",
          providerKey: "reddit", canonicalUrl: "https://example.test/reddit/verified" },
        { citationId: "c2", feedItemId: "feed-2", sourceItemId: "source-2",
          providerKey: "github", canonicalUrl: "https://example.test/github/verified" },
      ],
    });
    expect(JSON.stringify(detail.body)).not.toContain("invented-feed");
    expect(app.get(InMemorySummaryEventPublisher).all()).toHaveLength(1);
    expect(metrics.counterValue("summary_model_requests_total", {
      model: "synthetic-openai-summary", provider: "openai-responses", status: "succeeded",
    })).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("fails closed on malformed provider JSON without artifact or ready event", async () => {
    responseMode = "malformed";
    const requested = await requestJob("model-e2e-invalid");
    const summaryJobId = requested.body.summaryJobId as string;
    const result = await app.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenant, workspaceId: workspace, summaryJobId,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Malformed provider JSON was accepted");
    expect(result.error).toMatchObject({ code: "external.dependency_unavailable" });

    const job = await app.get(InMemorySummaryJobRepository).findById({
      tenantId: tenant, workspaceId: workspace, summaryJobId,
    });
    expect(job?.toSnapshot().status).toBe("failed");
    expect(app.get(InMemorySummaryEventPublisher).all()).toHaveLength(1);
    expect(metrics.counterValue("summary_model_requests_total", {
      model: "synthetic-openai-summary", provider: "openai-responses",
      status: "failed", failure_kind: "invalid_schema",
    })).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it("does not load another tenant's job or dispatch another model request", async () => {
    const requested = await requestJob("model-e2e-tenant-isolation");
    const summaryJobId = requested.body.summaryJobId as string;
    const result = await app.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenantId(deterministicTestUuid("model-boundary-other-tenant")),
      workspaceId: workspace,
      summaryJobId,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Cross-tenant job access was accepted");
    expect(result.error).toMatchObject({ code: "resource.not_found" });
    expect(calls).toHaveLength(2);
    expect(app.get(InMemorySummaryEventPublisher).all()).toHaveLength(1);
  });

});
