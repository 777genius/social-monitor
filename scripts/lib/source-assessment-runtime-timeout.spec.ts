import { SystemClock } from "@social-monitor/shared-kernel";
import { createSourceAssessmentRuntime } from "@social-monitor/summary/interfaces/rest/source-assessment-runtime-provider-tokens";
import { createSourceContentAssessmentReviewer } from "@social-monitor/relevance/interfaces/rest/source-content-assessment-provider-tokens";
import { cutoff, fixture, run } from "../../test/support/promotion-content-assessment";
import { attestRefreshExecution, refreshTestRuntimeClient } from "./reader-summary-new-input-refresh-model.spec-support";
import { outputFor } from "./source-content-assessment-runtime.spec-support";

describe("source assessment configured operation timeout", () => {
  it.each([
    [undefined, undefined, undefined, undefined, 600_000, 300_000],
    ["1200000", "1200000", undefined, undefined, 1_200_000, 600_000],
    ["900000", "600000", undefined, "3600000", 3_600_000, 600_000],
    ["900000", "600000", undefined, "7200000", 3_600_000, 600_000],
    ["120000", "300000", undefined, undefined, 120_000, 120_000],
    ["1200000", "90000", undefined, undefined, 1_200_000, 90_000],
    [undefined, undefined, "1200000", undefined, 1_200_000, 600_000],
    ["900000", "120000", "1800000", undefined, 900_000, 120_000],
  ])(
    "resolves summary=%s relation=%s fallback=%s assessment=%s",
    (summary, relation, fallback, assessment, total, batch) => {
      const client = refreshTestRuntimeClient(async () => {
        throw new Error("No runtime call expected");
      });
      const runtime = createSourceAssessmentRuntime({
        client,
        clock: new SystemClock(),
        env: {
          AGENT_RUNTIME_READER_SUMMARY_TIMEOUT_MS: summary,
          AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_TIMEOUT_MS:
            relation,
          AGENT_RUNTIME_TIMEOUT_MS: fallback,
          AGENT_RUNTIME_SOURCE_CONTENT_ASSESSMENT_TOTAL_TIMEOUT_MS: assessment,
          AGENT_RUNTIME_PROVIDER_INSTANCE_ID: "synthetic-existing-pool",
        },
      });
      expect(runtime).toEqual({
        client,
        providerInstanceId: "synthetic-existing-pool",
        totalTimeoutMs: total,
        batchTimeoutMs: batch,
      });
    },
  );

  it("completes all 200 candidates beyond 600 seconds within the configured 1200 seconds", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(cutoff);
    try {
      const timeouts: number[] = [];
      const controls: unknown[] = [];
      const client = refreshTestRuntimeClient(async (request) => {
        timeouts.push(request.timeoutMs);
        controls.push(JSON.parse(request.controlsJson));
        await new Promise((resolve) => setTimeout(resolve, 40_000));
        return attestRefreshExecution(request, outputFor(request));
      });
      const clock = new SystemClock();
      const reviewer = createSourceContentAssessmentReviewer({ client, clock,
        ids: { generate: () => `synthetic-budget-${timeouts.length}` }, summaryModelMode: "agent-runtime",
        env: { AGENT_RUNTIME_READER_SUMMARY_TIMEOUT_MS: "1200000",
          AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_TIMEOUT_MS: "1200000" } });
      const pending = run(Array.from({ length: 200 }, (_, i) => fixture(`population-${i}`)), reviewer, { clock });
      await jest.advanceTimersByTimeAsync(1_000_001);
      const result = await pending;
      expect(timeouts).toHaveLength(25);
      expect(timeouts.every((timeout) => timeout > 0 && timeout <= 600_000)).toBe(true);
      expect(timeouts[0]).toBe(600_000);
      expect(timeouts[24]).toBe(240_000);
      for (const control of controls) {
        expect(control).toMatchObject({ model: "gpt-5.6-sol", reasoningEffort: "low" });
      }
      expect(result.ranking.orderedCandidateIds).toHaveLength(200);
      expect(result.candidates.filter((candidate) => candidate.evidenceQualityScore === 0)).toHaveLength(0);
    } finally { jest.useRealTimers(); }
  });
});
