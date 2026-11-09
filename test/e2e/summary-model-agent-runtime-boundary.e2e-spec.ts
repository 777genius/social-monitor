import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { AgentRuntimeSummaryModelAdapter } from "@social-monitor/summary/adapters/model/agent-runtime-summary-model.adapter";
import { MeteredSummaryModelAdapter } from "@social-monitor/summary/adapters/model/metered-summary-model.adapter";
import { InMemorySummaryArtifactRepository } from "@social-monitor/summary/adapters/persistence/in-memory-summary-artifact.repository";
import { InMemorySummaryEventPublisher } from "@social-monitor/summary/adapters/messaging/in-memory-summary-event-publisher";
import { InMemorySummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-summary-job.repository";
import { ExecuteSummaryJobUseCase } from "@social-monitor/summary/features/execute-summary-job/execute-summary-job.use-case";
import { SUMMARY_EVIDENCE_SELECTOR } from "@social-monitor/summary/interfaces/rest/summary-provider-tokens";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
  SummaryEvidenceSelection,
  SummaryEvidenceSelectorPort,
} from "@social-monitor/summary/ports";
import request from "supertest";

import { AppModule } from "../../apps/api-gateway/src/app.module";
import { deterministicTestUuid } from "./support/deterministic-test-uuid";

const tenant = tenantId(deterministicTestUuid("agent-model-e2e-tenant"));
const workspace = workspaceId(deterministicTestUuid("agent-model-e2e-workspace"));
const now = new Date("2026-06-21T10:00:00.000Z");
const evidence: SummaryEvidenceSelection = {
  sourceWindow: {
    windowId: "agent-model-e2e-window",
    startedAt: new Date("2026-06-21T09:00:00.000Z"),
    endedAt: now,
    selectedFeedItemIds: ["feed-1"],
  },
  items: [{
    feedItemId: "feed-1",
    sourceItemId: "source-1",
    sourceBindingId: "binding-1",
    providerKey: "reddit",
    title: "Synthetic reader signal",
    bodyPreview: "One deterministic source with no real model request.",
    canonicalUrl: "https://example.test/reddit/agent-model-e2e",
    observedAt: now,
  }],
};

const providerDraft = () => ({
  headline: "Synthetic reader signal",
  executiveSummary: "A synthetic source documents a tested summary pipeline.",
  keyPoints: [{
    claim: "The model output has a grounded citation.", citationIds: ["c1"],
  }],
  risksAndUnknowns: [],
  sourceHighlights: ["Synthetic source"],
  citationMap: [{
    citationId: "c1", feedItemId: "untrusted-feed", sourceItemId: "untrusted-source",
    providerKey: "untrusted-provider", field: "bodyPreview",
  }],
  qualityFlags: ["limited_sources"],
  confidence: { level: "medium", score: 0.62,
    rationale: "One synthetic source supports a controlled regression." },
  noSignalReason: null,
});

describe("Agent Runtime summary provider through REST and job execution (e2e)", () => {
  let app: INestApplication;
  const commands: AgentRuntimeTaskCommand[] = [];
  const metrics = new InMemoryMetricsRecorder();
  let responseMode: "completed" | "waiting_for_input" = "completed";

  beforeAll(async () => {
    const selector: SummaryEvidenceSelectorPort = {
      select: async (params) => {
        if (params.tenantId !== tenant || params.workspaceId !== workspace) {
          throw new Error("Synthetic evidence scope does not match");
        }
        return params.interestId === "agent-model-e2e-no-signal"
          ? {
              ...evidence,
              sourceWindow: { ...evidence.sourceWindow, selectedFeedItemIds: [] },
              items: [],
            }
          : evidence;
      },
    };
    const client: AgentRuntimeClientPort = {
      runTask: async (command) => {
        commands.push(command);
        return responseMode === "completed"
          ? {
              status: "completed",
              structuredOutput: providerDraft(),
              warnings: [],
              usage: {
                inputTokens: 101, outputTokens: 55,
                totalTokens: 156, estimatedCostUsd: 0,
              },
            }
          : { status: "waiting_for_input", warnings: [] };
      },
      checkHealth: async () => ({
        status: "serving",
        runtimeEngine: "synthetic",
        runtimeVersion: "test",
        warnings: [],
      }),
    };
    const adapter = new AgentRuntimeSummaryModelAdapter({
      client, agentProvider: "codex", model: "synthetic-summary",
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SUMMARY_EVIDENCE_SELECTOR)
      .useValue(selector)
      .overrideProvider(MeteredSummaryModelAdapter)
      .useValue(new MeteredSummaryModelAdapter(adapter, metrics))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
    }));
    await app.init();
  });

  afterAll(async () => app.close());

  const requestJob = async (interestId: string) =>
    request(app.getHttpServer())
      .post("/interests/" + interestId + "/summary-requests")
      .set("x-tenant-id", tenant)
      .set("x-workspace-id", workspace)
      .set("x-workspace-role", "member")
      .set("x-request-id", interestId)
      .set("idempotency-key", interestId)
      .expect(201);

  it("preserves identity, evidence citations, usage and ready event", async () => {
    responseMode = "completed";
    const requested = await requestJob("agent-model-e2e-complete");
    const executed = await app.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: requested.body.summaryJobId as string,
    });
    expect(executed.ok).toBe(true);
    if (!executed.ok || executed.value.summaryId === undefined) {
      throw new Error("Synthetic Agent Runtime summary must be persisted");
    }
    const artifact = await app.get(InMemorySummaryArtifactRepository).findById({
      tenantId: tenant, workspaceId: workspace, summaryId: executed.value.summaryId,
    });
    expect(artifact?.toSnapshot()).toMatchObject({
      tenantId: tenant,
      workspaceId: workspace,
      lineage: { providerVersion: "agent-runtime", modelVersion: "codex:synthetic-summary" },
      citationMap: [{
        citationId: "c1", feedItemId: "feed-1", sourceItemId: "source-1",
        providerKey: "reddit", canonicalUrl: "https://example.test/reddit/agent-model-e2e",
      }],
      usage: { inputTokens: 101, outputTokens: 55 },
    });
    expect(commands[0]).toMatchObject({
      tenantId: tenant,
      workspaceId: workspace,
      purpose: "social_monitor.summary.generate",
      controls: {
        interactive: false,
        model: "synthetic-summary",
      },
    });
    expect(app.get(InMemorySummaryEventPublisher).all()).toHaveLength(1);
    expect(metrics.counterValue("summary_model_requests_total", {
      model: "codex:synthetic-summary", provider: "agent-runtime", status: "succeeded",
    })).toBe(1);
  });

  it("fails closed on interactive runtime status and publishes no extra artifact", async () => {
    responseMode = "waiting_for_input";
    const requested = await requestJob("agent-model-e2e-interactive");
    const executed = await app.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: requested.body.summaryJobId as string,
    });
    expect(executed.ok).toBe(false);
    if (executed.ok) throw new Error("Interactive runtime response was accepted");
    expect(executed.error).toMatchObject({ code: "external.dependency_unavailable" });
    const job = await app.get(InMemorySummaryJobRepository).findById({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: requested.body.summaryJobId as string,
    });
    expect(job?.toSnapshot().status).toBe("failed");
    expect(commands).toHaveLength(2);
    expect(app.get(InMemorySummaryEventPublisher).all()).toHaveLength(1);
    expect(metrics.counterValue("summary_model_requests_total", {
      model: "codex:synthetic-summary", provider: "agent-runtime",
      status: "failed", failure_kind: "unsafe_or_refused",
    })).toBe(1);
  });

  it("returns a local no-signal artifact without invoking the runtime", async () => {
    const commandCount = commands.length;
    const requested = await requestJob("agent-model-e2e-no-signal");
    const executed = await app.get(ExecuteSummaryJobUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: requested.body.summaryJobId as string,
    });
    expect(executed.ok).toBe(true);
    if (!executed.ok || executed.value.summaryId === undefined) {
      throw new Error("No-signal path must save a local summary artifact");
    }
    expect(executed.value.status).toBe("no_signal");
    expect(commands).toHaveLength(commandCount);
    const artifact = await app.get(InMemorySummaryArtifactRepository).findById({
      tenantId: tenant,
      workspaceId: workspace,
      summaryId: executed.value.summaryId,
    });
    expect(artifact?.toSnapshot()).toMatchObject({
      qualityFlags: ["no_signal", "limited_sources"],
      lineage: { providerVersion: "agent-runtime" },
    });
  });

});
