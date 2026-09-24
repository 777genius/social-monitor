import { resolveReaderSummarySelectionStrategy } from
  "./reader-summary-selection-strategy.resolver";

const tenantId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const interestId = "44444444-4444-4444-8444-444444444444";
const base = { READER_VALUE_MODE: "jev_primary_v3",
  RELEVANCE_PERSISTENCE: "prisma", SUMMARY_PERSISTENCE: "prisma",
  READER_VALUE_SCORING_LOOP: "enabled",
  INTELLIGENCE_READER_SUMMARY_JOB_LOOP: "enabled",
  READER_VALUE_DISCOVERY_SCOPES: JSON.stringify([{ tenantId, workspaceId,
    interestId }]) };

describe("reader summary selection strategy", () => {
  it("defaults to primary for all interest jobs when durable dependencies are configured", () => {
    expect(() => resolveReaderSummarySelectionStrategy({})).toThrow(/requires/u);
    const defaultPrimary = resolveReaderSummarySelectionStrategy({
      RELEVANCE_PERSISTENCE: "prisma", SUMMARY_PERSISTENCE: "prisma" });
    expect(defaultPrimary.resolve({ tenantId, workspaceId, interestId }))
      .toBe("jev_primary_v3");
    expect(defaultPrimary.resolve({ tenantId, workspaceId }))
      .toBe("legacy_v2");
    const primary = resolveReaderSummarySelectionStrategy(base);
    expect(primary.resolve({ tenantId, workspaceId, interestId }))
      .toBe("jev_primary_v3");
    expect(primary.resolve({ tenantId, workspaceId })).toBe("legacy_v2");
    expect(primary.resolve({ tenantId, workspaceId:
      "33333333-3333-4333-8333-333333333333", interestId }))
      .toBe("legacy_v2");
    expect(primary.resolve({ tenantId, workspaceId,
      interestId: "55555555-5555-4555-8555-555555555555" }))
      .toBe("legacy_v2");
  });

  it.each(["RELEVANCE_PERSISTENCE", "SUMMARY_PERSISTENCE",
    ])(
    "rejects primary without %s", (key) => {
      expect(() => resolveReaderSummarySelectionStrategy({ ...base,
        [key]: undefined })).toThrow(/requires/u);
    });
  it.each(["READER_VALUE_SCORING_LOOP", "INTELLIGENCE_READER_SUMMARY_JOB_LOOP"])(
    "rejects explicitly disabled primary dependency %s", (key) => {
      expect(() => resolveReaderSummarySelectionStrategy({ ...base,
        [key]: "disabled" })).toThrow(/requires/u);
    });
  it("rejects a restricted due poller when primary covers all interests", () => {
    expect(() => resolveReaderSummarySelectionStrategy({ ...base,
      READER_VALUE_DISCOVERY_SCOPES: undefined,
      INTELLIGENCE_READER_SUMMARY_JOB_LOOP_TENANT_ID: tenantId,
      INTELLIGENCE_READER_SUMMARY_JOB_LOOP_WORKSPACE_ID: workspaceId,
    })).toThrow(/cover every/u);
  });
  it("keeps shadow rollout explicitly scoped", () => {
    expect(() => resolveReaderSummarySelectionStrategy({
      READER_VALUE_MODE: "jev_shadow" })).toThrow(/scope/u);
  });
});
