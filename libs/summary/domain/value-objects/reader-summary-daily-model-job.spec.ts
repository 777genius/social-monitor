import {
  readerSummaryDailyModelJobIdentity,
  readerSummaryDailyModel,
  readerSummaryDailyModelProvider,
  readerSummaryDailyReasoningEffort,
  readerSummaryDailyRuntimeEngine,
} from "./reader-summary-daily-model-job";

const input = {
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000002",
  requestedUtcDate: "2026-07-31",
  sourceAuthoritySha256: "a".repeat(64),
};

describe("readerSummaryDailyModelJobIdentity", () => {
  it("pins a deterministic production model identity", () => {
    const first = readerSummaryDailyModelJobIdentity(input);
    const second = readerSummaryDailyModelJobIdentity({ ...input });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      provider: readerSummaryDailyModelProvider,
      model: readerSummaryDailyModel,
      reasoningEffort: readerSummaryDailyReasoningEffort,
      runtimeEngine: readerSummaryDailyRuntimeEngine,
    });
    expect(first.value).toBe(
      "8bebb9705b3371f1b86b2f453e1114cf38f029d91d454c1a5618a23258464150",
    );
    expect(first.value).toMatch(/^[0-9a-f]{64}$/u);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it.each([
    ["tenantId", { tenantId: "not-a-uuid" }],
    ["workspaceId", { workspaceId: "not-a-uuid" }],
    ["date", { requestedUtcDate: "2026-02-30" }],
    ["SHA", { sourceAuthoritySha256: "ABC" }],
  ])("rejects an invalid %s", (_label, patch) => {
    expect(() => readerSummaryDailyModelJobIdentity({ ...input, ...patch })).toThrow();
  });
});
