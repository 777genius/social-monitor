import {
  buildExistingReaderSummaryTopicRelations,
  buildReaderSummaryTopicRelationCandidates,
  buildSemanticallyEquivalentReaderSummaryTopicRelations,
} from "./reader-summary-topic-relation-candidates";

describe("buildReaderSummaryTopicRelationCandidates", () => {
  it("surfaces concrete overlap without auto-merging broad matches", () => {
    expect(
      buildReaderSummaryTopicRelationCandidates([
        candidate("node:announcement", ["ChatGPT Work", "Codex Work Agent"]),
        candidate("node:leader-post", ["Codex Work Product"]),
        candidate("node:course", ["Codex Course"]),
      ]),
    ).toEqual([
      {
        sourceNodeId: "node:announcement",
        targetNodeId: "node:leader-post",
        sharedTerms: ["work", "codex"],
      },
    ]);
  });

  it("always includes existing LLM merges even without lexical overlap", () => {
    const candidates = [
      candidate("node:a", ["ChatGPT Work"]),
      candidate("node:b", ["Executive Comment"]),
    ];

    expect(
      buildExistingReaderSummaryTopicRelations(candidates, [
        { nodeId: "node:a", topicId: "topic:work" },
        { nodeId: "node:b", topicId: "topic:work" },
      ]),
    ).toEqual([
      {
        sourceNodeId: "node:a",
        targetNodeId: "node:b",
        sharedTerms: [],
      },
    ]);
  });

  it("prioritizes exact semantic identities even without lexical overlap", () => {
    const candidates = [
      candidate("node:official", ["Official announcement"]),
      candidate("node:executive", ["Executive follow-up"]),
      candidate("node:other", ["Different product"]),
    ];

    expect(
      buildSemanticallyEquivalentReaderSummaryTopicRelations(candidates, [
        semanticLabel("node:official", "ChatGPT Work", "release"),
        semanticLabel("node:executive", "ChatGPT Work", "release"),
        semanticLabel("node:other", "ChatGPT Work", "comparison"),
      ]),
    ).toEqual([
      {
        sourceNodeId: "node:official",
        targetNodeId: "node:executive",
        sharedTerms: ["chatgpt", "work"],
      },
    ]);
  });
});

const candidate = (nodeId: string, keywords: readonly string[]) => ({
  nodeId,
  fallbackLabel: keywords[0] ?? nodeId,
  keywords,
  labelCandidates: [],
});

const semanticLabel = (
  nodeId: string,
  subject: string,
  claimType: "release" | "comparison",
) => ({
  nodeId,
  semantic: {
    subject,
    claimType,
    confidenceScore: 0.9,
  },
});
