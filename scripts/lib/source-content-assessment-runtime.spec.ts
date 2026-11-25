import { FixedClock, SystemClock } from "@social-monitor/shared-kernel";
import { AgentRuntimeSourceContentQualityReviewerAdapter } from "@social-monitor/relevance/adapters/model/agent-runtime-source-content-quality-reviewer.adapter";
import { createSourceContentAssessmentReviewer } from "@social-monitor/relevance/interfaces/rest/source-content-assessment-provider-tokens";
import { resolveRelevanceContentQualityReviewerMode } from "@social-monitor/relevance/interfaces/rest/relevance-provider-tokens";
import { admitSubscriptionRuntimeRequest } from "../../apps/agent-runtime/src/subscription-runtime-purpose-model-policy";
import type { AgentRuntimeExecutionRequest } from "../../apps/agent-runtime/src/agent-runtime-executor.port";
import { cutoff, fixture, run, scope } from "../../test/support/promotion-content-assessment";
import { attestRefreshExecution, refreshTestRuntimeClient } from "./reader-summary-new-input-refresh-model.spec-support";

import { outputFor } from "./source-content-assessment-runtime.spec-support";

const runtimeReviewer = (execute: Parameters<typeof refreshTestRuntimeClient>[0]) => {
  let id = 0;
  const client = refreshTestRuntimeClient(execute);
  return createSourceContentAssessmentReviewer({ env: { RELEVANCE_CONTENT_QUALITY_REVIEWER: "auto",
    AGENT_RUNTIME_PROVIDER_INSTANCE_ID: "synthetic-existing-pool" },
    summaryModelMode: "agent-runtime", client, clock: new FixedClock(cutoff),
    ids: { generate: () => `synthetic-${++id}` } });
};

describe("pool-backed assessment through runtime transport and actual promotion", () => {
  it("uses the supplied client and existing pool identity for all 32 candidates across providers", async () => {
    const requests: AgentRuntimeExecutionRequest[] = [];
    const reviewer = runtimeReviewer(async (request) => {
      requests.push(request);
      expect(admitSubscriptionRuntimeRequest(request).profile).toMatchObject({
        provider: "codex", model: "gpt-5.6-sol", outputKind: "structured_output" });
      return attestRefreshExecution(request, outputFor(request));
    });
    const result = await run(Array.from({ length: 32 }, (_, index) =>
      fixture(`pool-${index}`, ["reddit", "hacker-news", "x-twitter"][index % 3])), reviewer);
    expect(result.ranking.orderedCandidateIds).toHaveLength(32);
    expect(requests).toHaveLength(4);
    expect(new Set(requests.map((request) => request.requestId)).size).toBe(4);
    for (const request of requests) {
      expect(request).toMatchObject({ tenantId: scope.tenantId, workspaceId: scope.workspaceId,
        providerInstanceId: "synthetic-existing-pool", timeoutMs: 300_000 });
      expect(JSON.parse(request.prompt).candidates).toHaveLength(8);
      expect(request.prompt).not.toMatch(/canonicalUrl|deterministic|upvoteRatio/);
    }
  });

  it("keeps partial output pending and continues after one failed batch without retries", async () => {
    let calls = 0;
    const reviewer = runtimeReviewer(async (request) => {
      calls++;
      if (calls === 2) return { status: "failed", warnings: [] };
      const output = outputFor(request);
      if (calls === 1) output.reviews.pop();
      return attestRefreshExecution(request, output);
    });
    const result = await run(Array.from({ length: 32 }, (_, index) => fixture(`partial-${index}`)), reviewer);
    expect(calls).toBe(4);
    expect(result.ranking.orderedCandidateIds).toHaveLength(23);
  });

  it.each(["identity", "range"])("rejects mismatched %s evidence", async (mutation) => {
    const reviewer = runtimeReviewer(async (request) => {
      const output = outputFor(request);
      if (mutation === "range") output.reviews[0]!.evidence[0]!.start = 1;
      const result = await attestRefreshExecution(request, output);
      if (mutation === "identity") return { ...result, executionAttestation: {
        ...result.executionAttestation!, requestId: "another-task" } };
      return result;
    });
    expect((await run([fixture("bad-wire")], reviewer)).ranking.orderedCandidateIds).toHaveLength(0);
  });

  it("accepts bindingId echo drift when the exact request is attested", async () => {
    const reviewer = runtimeReviewer(async (request) => {
      const output = outputFor(request);
      output.reviews[0]!.bindingId = "other-workspace-binding";
      return attestRefreshExecution(request, output);
    });
    expect((await run([fixture("binding-drift")], reviewer)).ranking.orderedCandidateIds).toHaveLength(1);
  });

  it("allows pool latency beyond the former 60-second total within runtime bounds", async () => {
    jest.useFakeTimers();
    try {
      const reviewer = runtimeReviewer(async (request) => {
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        return attestRefreshExecution(request, outputFor(request));
      });
      const pending = run(Array.from({ length: 32 }, (_, i) => fixture(`latency-${i}`)), reviewer);
      await jest.advanceTimersByTimeAsync(160_001);
      expect((await pending).ranking.orderedCandidateIds).toHaveLength(32);
    } finally { jest.useRealTimers(); }
  });

  it("passes the remaining total budget to the task and rejects late completion", async () => {
    jest.useFakeTimers();
    try {
      const requests: AgentRuntimeExecutionRequest[] = [];
      const client = refreshTestRuntimeClient(async (request) => {
        requests.push(request);
        await new Promise((resolve) => setTimeout(resolve, 40_000));
        return attestRefreshExecution(request, outputFor(request));
      });
      const reviewer = new AgentRuntimeSourceContentQualityReviewerAdapter({ client, clock: new SystemClock(),
        ids: { generate: () => `deadline-${requests.length}` }, batchTimeoutMs: 50_000, totalTimeoutMs: 60_000 });
      jest.setSystemTime(cutoff);
      const pending = run(Array.from({ length: 16 }, (_, i) => fixture(`cancel-${i}`)), reviewer,
        { clock: new SystemClock() });
      await jest.advanceTimersByTimeAsync(60_001);
      const result = await pending;
      expect(result.ranking.orderedCandidateIds).toHaveLength(8);
      await jest.advanceTimersByTimeAsync(40_000);
      expect(result.ranking.orderedCandidateIds).toHaveLength(8);
      expect(requests).toHaveLength(2);
      expect(requests.map((request) => request.timeoutMs)).toEqual([50_000, 20_000]);
    } finally { jest.useRealTimers(); }
  });

  it("auto selects pool runtime without credentials and disabled mode cannot admit", async () => {
    expect(resolveRelevanceContentQualityReviewerMode({ AGENT_RUNTIME_GRPC_ADDRESS: "synthetic:1" })).toBe("agent-runtime");
    expect(resolveRelevanceContentQualityReviewerMode({ OPENAI_API_KEY: "synthetic" })).toBe("openai-responses");
    const reviewer = createSourceContentAssessmentReviewer({ summaryModelMode: "agent-runtime",
      env: { RELEVANCE_CONTENT_QUALITY_REVIEWER: "disabled", OPENAI_API_KEY_FILE: "/must-not-read" } });
    expect((await run([fixture("disabled")], reviewer)).ranking.orderedCandidateIds).toHaveLength(0);
  });
});
