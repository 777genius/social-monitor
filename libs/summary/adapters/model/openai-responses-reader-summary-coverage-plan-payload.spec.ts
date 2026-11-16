import type { ReaderSummaryModelInput } from "../../ports";
import { readerSummaryInput } from "./agent-runtime-reader-summary-model.spec-support";
import { buildOpenAiReaderSummaryPromptPayload } from "./openai-responses-reader-summary-prompt";
import { buildOpenAiReaderSummaryPromptPayload as directPayload } from "./openai-responses-reader-summary-prompt-payload";
import { buildReaderSummaryCoveragePlanPromptPayload } from "./openai-responses-reader-summary-coverage-plan-payload";
import { readerSummaryCitableEvidence } from "./reader-summary-evidence-citation-map";

describe("reader summary coverage-plan prompt projection", () => {
  it("keeps approved lead/secondary order and filters only unknown feed item citations", () => {
    const input = readerSummaryInput();
    const lead = input.coveragePlan.lead;
    if (lead === undefined) throw new Error("Test fixture must include a lead");
    const first = lead.feedItemIds[0];
    if (first === undefined) throw new Error("Test fixture must include cited evidence");
    const plan: ReaderSummaryModelInput["coveragePlan"] = {
      ...input.coveragePlan,
      lead: { ...lead, feedItemIds: [first, "forged-feed", first] },
      secondary: [{
        ...lead, role: "secondary", clusterId: "approved-secondary",
        feedItemIds: ["forged-feed", first],
      }],
    };
    const before = JSON.stringify(plan);
    const citationIds = new Map([[first, "c1"]]);
    const result = buildReaderSummaryCoveragePlanPromptPayload(plan, citationIds);
    expect(result.mode).toBe(plan.mode);
    expect(result.lead).toMatchObject({
      role: lead.role, storyClusterId: lead.clusterId, citationIds: ["c1", "c1"],
      providerKeys: lead.providerKeys, interestIds: lead.interestIds,
    });
    expect(result.secondary).toEqual([expect.objectContaining({
      role: "secondary", storyClusterId: "approved-secondary", citationIds: ["c1"],
    })]);
    expect(JSON.stringify(plan)).toBe(before);
    expect([...citationIds.entries()]).toEqual([[first, "c1"]]);
  });

  it("preserves the historical null-lead encoding", () => {
    const input = readerSummaryInput();
    const plan: ReaderSummaryModelInput["coveragePlan"] = {
      ...input.coveragePlan, lead: undefined, secondary: [],
    };
    expect(buildReaderSummaryCoveragePlanPromptPayload(plan, new Map())).toEqual({
      mode: plan.mode, lead: null, secondary: [],
    });
  });

  it("keeps the original public serializer and exact evidence-derived citation projection", () => {
    const input = readerSummaryInput();
    const citations = readerSummaryCitableEvidence(input.evidence);
    const byFeedItem = new Map(
      citations.map((item, index) => [item.feedItemId, `c${index + 1}`] as const),
    );
    const serialized = buildOpenAiReaderSummaryPromptPayload(input);
    const decoded = JSON.parse(serialized) as { coveragePlan: unknown };
    expect(buildOpenAiReaderSummaryPromptPayload).toBe(directPayload);
    expect(decoded.coveragePlan).toEqual(
      buildReaderSummaryCoveragePlanPromptPayload(input.coveragePlan, byFeedItem),
    );
  });
});
