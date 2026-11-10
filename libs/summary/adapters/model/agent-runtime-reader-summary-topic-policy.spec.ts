import { READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID } from "../../domain";
import { normalizeSemanticGroupId } from "./agent-runtime-reader-summary-topic-group-policy";
import { semanticLabelFromRaw } from "./agent-runtime-reader-summary-topic-raw-decoder";

describe("topic map model-to-domain policy boundaries", () => {
  it("preserves strict grouping ID format and fail-closed ungrouped fallback", () => {
    expect(normalizeSemanticGroupId("group:agent-tools")).toBe("group:agent-tools");
    expect(normalizeSemanticGroupId("group:BAD")).toBe(READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID);
    expect(normalizeSemanticGroupId(undefined)).toBe(READER_SUMMARY_TOPIC_MAP_UNGROUPED_ID);
  });

  it("bounds model confidence and normalizes invalid claim types safely", () => {
    expect(semanticLabelFromRaw({ subject: "Synthetic", claimType: "not-a-claim", confidenceScore: 2 }, undefined))
      .toMatchObject({ subject: "Synthetic", claimType: "other", confidenceScore: 1 });
    expect(semanticLabelFromRaw({ subject: "Synthetic", confidenceScore: -1 }, undefined).confidenceScore)
      .toBe(0);
  });
});
