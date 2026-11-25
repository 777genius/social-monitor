import type { ReaderSummaryTopicLabelCandidate } from "../../ports";
import { indexUniqueReaderSummaryTopicCandidates } from "./agent-runtime-reader-summary-topic-candidate-index";
import { readCompleteTopicNodeLabels } from "./agent-runtime-reader-summary-topic-untrusted-response";
import { completeRequiredGroundedTopicCohorts } from "./agent-runtime-reader-summary-topic-cohort-completion";
import { buildGroundedTopicRecoveryAnchorMaps } from "./agent-runtime-reader-summary-topic-anchor-keys";

const candidate = (nodeId: string, fallbackLabel: string): ReaderSummaryTopicLabelCandidate => ({
  nodeId,
  storyClusterId: `story:${nodeId}`,
  fallbackLabel,
  score: 10,
  evidenceCount: 1,
  providerKeys: ["rss"],
  interestIds: ["ai"],
  keywords: ["Orion"],
  labelCandidates: [],
});

const duplicateIdentityCases: readonly (readonly [string, boolean])[] = [
  ["repeated object", true],
  ["conflicting fallback", false],
];

const admissionCases: readonly (
  readonly [string, (items: readonly ReaderSummaryTopicLabelCandidate[]) => unknown]
)[] = [
  ["untrusted label admission", (items) => readCompleteTopicNodeLabels([], items)],
  ["cohort completion", (items) => completeRequiredGroundedTopicCohorts([], items, new Map())],
  ["grounded recovery anchor mapping", (items) =>
    buildGroundedTopicRecoveryAnchorMaps({ nodeLabels: [], candidates: items })],
];

describe("selected reader-summary topic candidate identity", () => {
  it("retains source order, references and immutable inputs for unique ids", () => {
    const first = candidate("topic:beacon", "Orion Beacon");
    const second = candidate("topic:harbor", "Orion Harbor");
    const selected = Object.freeze([first, second]);
    const index = indexUniqueReaderSummaryTopicCandidates(selected);

    expect([...index.keys()]).toEqual(["topic:beacon", "topic:harbor"]);
    expect(index.get(first.nodeId)).toBe(first);
    expect(index.get(second.nodeId)).toBe(second);
    expect(selected).toEqual([first, second]);
  });

  it.each(duplicateIdentityCases)("rejects ambiguous candidate identity for %s", (_, sameObject) => {
    const first = candidate("topic:beacon", "Orion Beacon");
    const duplicate = sameObject ? first : candidate("topic:beacon", "Another label");
    expect(() => indexUniqueReaderSummaryTopicCandidates([first, duplicate]))
      .toThrow("Reader summary topic candidate nodeIds must be unique");
  });

  it("keeps unique candidate admission compatible with empty provider records", () => {
    const result = indexUniqueReaderSummaryTopicCandidates([
      candidate("topic:beacon", "Orion Beacon"),
    ]);
    expect(result.size).toBe(1);
  });

  it.each(admissionCases)("rejects duplicate selected ids in %s before Map overwrite", (_, project) => {
    const items = [
      candidate("topic:beacon", "Orion Beacon"),
      candidate("topic:beacon", "False anchor"),
    ];
    expect(() => project(items))
      .toThrow("Reader summary topic candidate nodeIds must be unique");
  });
});
