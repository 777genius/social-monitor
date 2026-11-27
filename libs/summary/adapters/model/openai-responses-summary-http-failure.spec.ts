import { InMemorySummaryExecutionWorkflow } from '@social-monitor/summary/adapters/persistence/in-memory-summary-execution-workflow';
import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { SummaryJob } from "../../domain";
import { ExecuteSummaryJobUseCase } from "../../features/execute-summary-job/execute-summary-job.use-case";
import { InMemorySummaryEventPublisher } from "../messaging/in-memory-summary-event-publisher";
import { InMemorySummaryArtifactRepository } from "../persistence/in-memory-summary-artifact.repository";
import { InMemorySummaryJobRepository } from "../persistence/in-memory-summary-job.repository";
import { InMemorySummaryPolicyRepository } from "../persistence/in-memory-summary-policy.repository";
import { OpenAiResponsesSummaryModelAdapter } from "./openai-responses-summary-model.adapter";
import {
  classifyOpenAiHttpFailure,
  readOpenAiResponseBody,
} from "./openai-responses-summary-http-failure";
import {
  classifyOpenAiHttpFailure as historicalHttpClassifier,
  readOpenAiResponseBody as historicalBodyReader,
} from "./openai-responses-summary-model-error";

const httpFailures = [
  { status: 429, kind: "provider_rate_limited", retryable: true },
  { status: 400, kind: "context_too_large", retryable: false },
  { status: 413, kind: "context_too_large", retryable: false },
  { status: 401, kind: "provider_unavailable", retryable: false },
  { status: 403, kind: "provider_unavailable", retryable: false },
  { status: 500, kind: "provider_unavailable", retryable: true },
  { status: 503, kind: "provider_unavailable", retryable: true },
  { status: 422, kind: "provider_unavailable", retryable: false },
] as const;

describe("OpenAI summary HTTP response boundary", () => {
  it("keeps the historical exports as identical functions", () => {
    expect(historicalHttpClassifier).toBe(classifyOpenAiHttpFailure);
    expect(historicalBodyReader).toBe(readOpenAiResponseBody);
  });

  it.each(httpFailures)("preserves the exact failure taxonomy for HTTP $status", ({ status, kind, retryable }) => {
    expect(classifyOpenAiHttpFailure(status, {
      error: { message: "Synthetic provider rejection" },
    })).toEqual({ kind, retryable, message: "Synthetic provider rejection" });
  });

  it("never treats a blank or malformed error message as a provider message", () => {
    expect(classifyOpenAiHttpFailure(503, {
      error: { message: "   " },
    })).toEqual({
      kind: "provider_unavailable",
      retryable: true,
      message: "OpenAI summary request failed with HTTP 503",
    });
    expect(classifyOpenAiHttpFailure(429, {
      error: { message: { unexpected: "object" } },
    })).toEqual({
      kind: "provider_rate_limited",
      retryable: true,
      message: "OpenAI summary request failed with HTTP 429",
    });
  });

  it.each([
    ["", {}],
    [" \n  ", {}],
    ['{"ok":true}', { ok: true }],
    ["not-json", { error: {} }],
  ])("decodes valid JSON and discards malformed response text", async (raw, expected) => {
    const response = { text: async () => raw } as unknown as Response;
    await expect(readOpenAiResponseBody(response)).resolves.toEqual(expected);
  });

  it("propagates a body read rejection unchanged", async () => {
    const failure = new Error("Synthetic transport read failure");
    const response = { text: async () => { throw failure; } } as unknown as Response;
    await expect(readOpenAiResponseBody(response)).rejects.toBe(failure);
  });

  it.each(httpFailures)("redacts raw HTTP $status bodies before persisting or returning a job failure", async ({ status, kind, retryable }) => {
    const privateMarker = "PRIVATE_SYNTHETIC_SOURCE_FRAGMENT";
    const fetchFn = jest.fn(async () => new Response(`<html>${privateMarker}</html>`, { status }));
    const adapter = new OpenAiResponsesSummaryModelAdapter({ apiKey: "fixture", fetchFn });
    const classifyError = jest.spyOn(adapter, "classifyError");
    const jobs = new InMemorySummaryJobRepository();
    const artifacts = new InMemorySummaryArtifactRepository();
    const events = new InMemorySummaryEventPublisher();
    const tenant = tenantId("tenant-1");
    const workspace = workspaceId("workspace-1");
    const startedAt = new Date("2026-06-06T00:00:00.000Z");
    const endedAt = new Date("2026-06-06T00:00:01.000Z");
    const requestedAt = new Date("2026-06-06T00:00:02.000Z");
    const jobId = "summary-job-http-privacy";
    await jobs.save(SummaryJob.request({
      id: jobId, tenantId: tenant, workspaceId: workspace, interestId: "interest-1",
      idempotencyKey: "summary-request-http-privacy", requestedAt,
    }));
    const useCase = new ExecuteSummaryJobUseCase(
      jobs, artifacts, new InMemorySummaryPolicyRepository(),
      { findEffectivePreference: async () => null },
      { select: async () => ({
        sourceWindow: { windowId: "window-1", startedAt, endedAt, selectedFeedItemIds: ["feed-1"] },
        items: [{
          feedItemId: "feed-1", sourceItemId: "source-1", sourceBindingId: "binding-1",
          providerKey: "rss", title: "Selected source", bodyPreview: privateMarker,
          canonicalUrl: "https://example.test/source-1", observedAt: startedAt,
        }],
      }) },
      adapter, new InMemorySummaryExecutionWorkflow(jobs, artifacts, events), { generate: () => "unused-summary-id" }, new FixedClock(requestedAt),
    );

    const result = await useCase.execute({
      tenantId: tenant, workspaceId: workspace, summaryJobId: jobId,
    });
    const message = `OpenAI summary request failed with HTTP ${status}`;

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(classifyError).toHaveBeenCalledTimes(1);
    expect(classifyError.mock.results[0]?.value).toEqual({ kind, retryable, message });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "external.dependency_unavailable", message, details: { kind } },
    });
    const stored = await jobs.findById({
      tenantId: tenant, workspaceId: workspace, summaryJobId: jobId,
    });
    expect(stored?.toSnapshot()).toMatchObject({ status: "failed", failureReason: message });
    expect(JSON.stringify(stored?.toSnapshot())).not.toContain(privateMarker);
    expect(events.all()).toEqual([]);
    await expect(artifacts.list({ tenantId: tenant, workspaceId: workspace, limit: 10 }))
      .resolves.toEqual({ items: [], nextCursor: undefined });
  });
});
