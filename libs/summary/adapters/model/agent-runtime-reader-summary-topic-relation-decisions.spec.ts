import type { ReaderSummaryTopicRelationVerifierInput } from "../../ports";
import { normalizeDecisions, parseJsonObject } from "./agent-runtime-reader-summary-topic-relation-decisions";

const relations: ReaderSummaryTopicRelationVerifierInput["relations"] = [
  { sourceNodeId: "topic-a", targetNodeId: "topic-b", sharedTerms: ["shared", "source"] },
];

describe("Agent Runtime topic relation output contract", () => {
  it("requires exactly one bounded decision per requested pair", () => {
    const decoded = normalizeDecisions({
      decisions: [{
        sourceNodeId: " topic-a ", targetNodeId: "topic-b",
        sameTopic: true, confidenceScore: 0.8, rationale: " Shared source ",
      }],
    }, relations);
    expect(decoded).toMatchObject([
      { sourceNodeId: "topic-a", targetNodeId: "topic-b", sameTopic: true, confidenceScore: 0.8 },
    ]);
    expect(() => normalizeDecisions({ decisions: [] }, relations)).toThrow(
      "must decide every requested pair exactly once",
    );
  });

  it("rejects fabricated extra pairs, nonfinite scores and non-object output", () => {
    expect(() => normalizeDecisions({ decisions: [
      { sourceNodeId: "wrong", targetNodeId: "topic-b", sameTopic: true, confidenceScore: 0.7 },
    ] }, relations)).toThrow("must decide every requested pair exactly once");
    expect(() => normalizeDecisions({ decisions: [
      { sourceNodeId: "topic-a", targetNodeId: "topic-b", sameTopic: true, confidenceScore: 2 },
    ] }, relations)).toThrow("must decide every requested pair exactly once");
    expect(() => parseJsonObject("[]")).toThrow("must be an object");
  });
});
