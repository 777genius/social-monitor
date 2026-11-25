import { canonicalizeReaderSummaryWeeklyJson } from "./reader-summary-weekly-canonical-json";
import {
  canonicalReaderSummaryWeeklyReviewExecutionAttestation,
  type ReaderSummaryWeeklyReviewExecutionAttestation,
} from "./reader-summary-weekly-review-execution-attestation";

const legacy = {
  schemaVersion: 1 as const, requestId: "weekly:review:test",
  purpose: "social_monitor.reader_summary.weekly.review.v2" as const,
  canonicalRequestSha256: "a".repeat(64), provider: "codex" as const, model: "gpt-5.6-sol" as const,
  reasoningEffort: "high" as const, runtimeEngine: "subscription-runtime-cli" as const,
  runtimePackageVersion: "1.2.3", launcherSha256: "b".repeat(64),
  selectedOutputKind: "structured_output" as const, selectedOutputSha256: "c".repeat(64),
};
const gateway = {
  ...legacy, model: "gpt-6.1-sol" as const, reasoningEffort: "low" as const,
  runtimeEngine: "gateway-llm" as const,
  gateway: { profileId: "openai-codex-oauth-responses-v1", taskId: "test_task", attempt: 1,
    executionRef: "test_execution", requestRef: "test_request", accountRef: "test_account",
    observedModel: "gpt-6.1-sol-2026-10-01", requestSha256: "d".repeat(64) },
};

describe("weekly review execution evidence", () => {
  it("preserves historical canonical CLI receipts exactly, including review/xhigh", () => {
    for (const proof of [legacy, { ...legacy, purpose: "social_monitor.reader_summary.weekly.review" as const, reasoningEffort: "xhigh" as const }]) {
      expect(canonicalizeReaderSummaryWeeklyJson(canonicalReaderSummaryWeeklyReviewExecutionAttestation(proof, proof.selectedOutputSha256)).json)
        .toBe(canonicalizeReaderSummaryWeeklyJson(proof).json);
    }
  });
  it("retains the complete immutable gateway attempt", () => {
    const proof = canonicalReaderSummaryWeeklyReviewExecutionAttestation(gateway, gateway.selectedOutputSha256);
    expect(proof).toEqual(gateway);
    expect(Object.isFrozen(proof)).toBe(true);
    expect(Object.isFrozen(proof.gateway)).toBe(true);
  });
  it("accepts the Terra default and retains immutable gateway evidence", () => {
    const terra = { ...gateway, model: "gpt-6.1-terra" as const, reasoningEffort: "medium" as const,
      gateway: { ...gateway.gateway, observedModel: "gpt-6.1-terra-2026-10-01" } };
    const proof = canonicalReaderSummaryWeeklyReviewExecutionAttestation(terra, terra.selectedOutputSha256);
    expect(proof).toEqual(terra);
    expect(Object.isFrozen(proof.gateway)).toBe(true);
  });
  it.each([
    { ...gateway, gateway: { ...gateway.gateway, extra: "unexpected" } },
    { ...gateway, gateway: { ...gateway.gateway, requestRef: "" } },
    { ...gateway, gateway: { ...gateway.gateway, attempt: 0 } },
    { ...gateway, gateway: { ...gateway.gateway, observedModel: "gpt-6.1-sol-other" } },
    { ...gateway, gateway: { ...gateway.gateway, profileId: "different_profile" } },
    { ...gateway, reasoningEffort: "high" },
    { ...gateway, model: "gpt-6.1-terra", reasoningEffort: "low" },
    { ...gateway, model: "gpt-6.1-terra", reasoningEffort: "high" },
    { ...legacy, gateway: gateway.gateway },
  ])("rejects a forged transport shape or route", (proof) => {
    expect(() => canonicalReaderSummaryWeeklyReviewExecutionAttestation(proof as ReaderSummaryWeeklyReviewExecutionAttestation, legacy.selectedOutputSha256))
      .toThrow();
  });
});
