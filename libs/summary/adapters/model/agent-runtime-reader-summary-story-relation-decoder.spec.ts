import { InvalidStoryRelationDecisionBatchError } from "../../ports";
import {
  readDecisionEnvelope,
  normalizeBinaryDecisions,
  parseJsonObject,
} from "./agent-runtime-reader-summary-story-relation-decoder";

describe("story-relation verifier wire decoder", () => {
  it("rejects unexpected properties instead of accepting an ambiguous decision envelope", () => {
    expect(() => readDecisionEnvelope({ decisions: [], extra: true }))
      .toThrow(InvalidStoryRelationDecisionBatchError);
    expect(() => readDecisionEnvelope({ other: [] }))
      .toThrow(InvalidStoryRelationDecisionBatchError);
  });

  it("keeps binary decision payload normalization and trimmed ids", () => {
    expect(normalizeBinaryDecisions({ decisions: [
      { leftFeedItemId: " left ", rightFeedItemId: " right ", rationale: " note " },
    ] })).toEqual([
      { leftFeedItemId: "left", rightFeedItemId: "right", rationale: "note" },
    ]);
  });

  it("rejects malformed JSON before any task evidence can be attested", () => {
    try {
      parseJsonObject("{not-json", {});
      throw new Error("Expected strict parse rejection");
    } catch (error) {
      expect(error).toMatchObject({
        failure: { kind: "invalid_schema", retryable: false },
      });
    }
  });
});
