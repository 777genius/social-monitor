import { readerSummaryTopicClaimTypes } from "../../domain";
import {
  agentRuntimeReaderSummaryTopicLabelerInstructions as compatibilityInstructions,
} from "./agent-runtime-reader-summary-topic-labeler-prompt";
import {
  agentRuntimeReaderSummaryTopicLabelerInstructions as ownedInstructions,
} from "./agent-runtime-reader-summary-topic-labeler-instructions";

describe("Agent Runtime topic-label instructions boundary", () => {
  it("preserves the existing public export identity and all frozen provider rules", () => {
    expect(compatibilityInstructions).toBe(ownedInstructions);
    expect(ownedInstructions.split("\n")).toHaveLength(41);
    expect(ownedInstructions).toContain(
      "Return JSON only. Do not invent node ids.",
    );
    expect(ownedInstructions).toContain(
      "Treat coordinated coverage of one announcement as one topic",
    );
    expect(ownedInstructions).toContain(
      "Review relationshipHints before assigning topicId.",
    );
    expect(ownedInstructions).toContain(
      "If uncertain, keep the fallback node label and use group:ungrouped.",
    );
  });

  it("keeps the claim vocabulary sourced from the domain rather than evidence", () => {
    expect(ownedInstructions).toContain(
      `claimType must be exactly one of ${readerSummaryTopicClaimTypes.join(", ")}.`,
    );
    expect(ownedInstructions).toContain(
      "Do not use broad words such as AI, model, product, tool, ecosystem",
    );
  });
});
