import {
  parseAgentRuntimeReaderSummaryTopicLabelerJsonObject,
  readCompleteTopicNodeLabels,
  readUniqueTopicGroupRecords,
} from "./agent-runtime-reader-summary-topic-untrusted-response";
import { topicIntegrityFixture } from "./agent-runtime-reader-summary-topic-integrity.spec-support";

describe("untrusted topic map response admission", () => {
  const fixture = () => topicIntegrityFixture(["Beacon", "Harbor"]);

  it("admits each requested node once, retains order and drops forged relation authority", () => {
    const { candidates, rawLabels } = fixture();
    const input = [
      { ...rawLabels[0], keywords: [" A ", "", "B"], relationIdentity: { source: "forged" } },
      { ...rawLabels[1] },
      { ...rawLabels[0], nodeId: "node:unrequested" },
    ];
    const admitted = readCompleteTopicNodeLabels(input, candidates);
    expect(admitted.map((label) => label.nodeId)).toEqual(candidates.map((candidate) => candidate.nodeId));
    expect(admitted[0]).toMatchObject({ keywords: ["A", "B"], groupId: "group:ungrouped" });
    expect(admitted[0]).not.toHaveProperty("relationIdentity");
  });

  it("fails closed on duplicate or missing requested node IDs", () => {
    const { candidates, rawLabels } = fixture();
    for (const labels of [
      [rawLabels[0], rawLabels[0], rawLabels[1]],
      [rawLabels[0]],
      [{ ...rawLabels[0], nodeId: "node:unknown" }, rawLabels[1]],
    ]) {
      expect(() => readCompleteTopicNodeLabels(labels, candidates)).toThrow(
        "Reader summary topic map response must label every requested node exactly once",
      );
    }
  });

  it("keeps the first valid group definition and rejects ungrouped or invalid group keys", () => {
    const first = { id: "group:beacon", label: "First label" };
    const records = readUniqueTopicGroupRecords([
      first,
      { id: "group:beacon", label: "Second label" },
      { id: "group:ungrouped", label: "Not a semantic group" },
      { id: "group:Invalid", label: "Invalid group id" },
      null,
    ]);
    expect([...records.keys()]).toEqual(["group:beacon"]);
    expect(records.get("group:beacon")).toBe(first);
  });

  it("only parses top-level JSON objects, never arrays or primitive values", () => {
    expect(parseAgentRuntimeReaderSummaryTopicLabelerJsonObject('{"nodeLabels":[]}')).toEqual({ nodeLabels: [] });
    for (const text of ["null", "[]", "42", '"hello"']) {
      expect(() => parseAgentRuntimeReaderSummaryTopicLabelerJsonObject(text)).toThrow(
        "Reader summary topic map response must be a JSON object",
      );
    }
  });

  it("normalizes absent or invalid raw confidence into a required zero-score semantic label", () => {
    const { candidates, rawLabels } = fixture();
    const admitted = readCompleteTopicNodeLabels([
      { ...rawLabels[0], confidenceScore: undefined },
      { ...rawLabels[1], confidenceScore: "not-a-number" },
    ], candidates);
    expect(admitted.map((label) => label.semantic.confidenceScore)).toEqual([0, 0]);
    expect(admitted.every((label) => label.semantic !== undefined)).toBe(true);
  });
});
