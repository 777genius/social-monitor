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
    // Real JSON cannot encode NaN, but an injected/custom runtime client can
    // return structuredOutput directly; do not attest or publish it as trusted.
    expect(() => normalizeDecisions({ decisions: [
      { sourceNodeId: "topic-a", targetNodeId: "topic-b",
        sameTopic: true, confidenceScore: Number.NaN },
    ] }, relations)).toThrow("must decide every requested pair exactly once");
    expect(() => parseJsonObject("[]")).toThrow("must be an object");
  });
  it("does not treat delimiter-containing IDs as the same requested pair", () => {
    const requested: ReaderSummaryTopicRelationVerifierInput["relations"] = [{
      sourceNodeId: "a\u0000b", targetNodeId: "c",
      sharedTerms: ["synthetic"],
    }];
    const forged = {
      sourceNodeId: "a", targetNodeId: "b\u0000c",
      sameTopic: true, confidenceScore: 0.99,
    };
    expect(() => normalizeDecisions({ decisions: [forged] }, requested))
      .toThrow("must decide every requested pair exactly once");
    expect(normalizeDecisions({ decisions: [{
      ...forged, sourceNodeId: "a\u0000b", targetNodeId: "c",
    }] }, requested)).toMatchObject([{ sourceNodeId: "a\u0000b", targetNodeId: "c" }]);
  });

  it("checks exact unordered pair coverage, not just response length", () => {
    const requested: ReaderSummaryTopicRelationVerifierInput["relations"] = [
      ...relations,
      { sourceNodeId: "topic-b", targetNodeId: "topic-c", sharedTerms: ["synthetic"] },
    ];
    const first = {
      sourceNodeId: "topic-a", targetNodeId: "topic-b",
      sameTopic: true, confidenceScore: 0.75,
    };
    const second = {
      sourceNodeId: "topic-b", targetNodeId: "topic-c",
      sameTopic: false, confidenceScore: 0.25,
    };
    expect(() => normalizeDecisions({ decisions: [first, first] }, requested))
      .toThrow("must decide every requested pair exactly once");
    expect(() => normalizeDecisions({ decisions: [
      first, { ...second, targetNodeId: "fabricated-node" },
    ] }, requested)).toThrow("must decide every requested pair exactly once");
    expect(normalizeDecisions({ decisions: [
      { ...first, sourceNodeId: "topic-b", targetNodeId: "topic-a" },
      second,
    ] }, requested)).toEqual([
      { ...first, sourceNodeId: "topic-b", targetNodeId: "topic-a", rationale: undefined },
      { ...second, rationale: undefined },
    ]);
  });

});
