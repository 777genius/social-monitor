import {
  buildExistingReaderSummaryTopicRelations,
  buildReaderSummaryTopicRelationCandidates,
  buildReaderSummaryTopicRelationVerificationForest,
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

  it("reduces a ten-node merge clique to a deterministic spanning tree", () => {
    const candidates = Array.from({ length: 10 }, (_, index) =>
      candidate(`node:${index}`, [`Shared topic ${index}`]),
    );
    const existing = buildExistingReaderSummaryTopicRelations(
      candidates,
      candidates.map((item) => ({
        nodeId: item.nodeId,
        topicId: "topic:shared",
      })),
    );

    expect(existing).toHaveLength(45);
    const forest = buildReaderSummaryTopicRelationVerificationForest(
      existing,
      [],
    );
    expect(forest).toHaveLength(9);
    expect(
      new Set(
        forest.flatMap((relation) => [
          relation.sourceNodeId,
          relation.targetNodeId,
        ]),
      ).size,
    ).toBe(10);
    expect(
      buildReaderSummaryTopicRelationVerificationForest(
        existing
          .slice()
          .reverse()
          .map((relation) => ({
            ...relation,
            sourceNodeId: relation.targetNodeId,
            targetNodeId: relation.sourceNodeId,
          })),
        [],
      ),
    ).toEqual(forest);
  });

  it("deduplicates edges and preserves disconnected components", () => {
    const forest = buildReaderSummaryTopicRelationVerificationForest(
      [
        relation("node:a", "node:b", ["existing"]),
        relation("node:b", "node:a", ["duplicate"]),
        relation("node:b", "node:c", ["bridge"]),
        relation("node:a", "node:c", ["cycle"]),
        relation("node:d", "node:d", ["self"]),
      ],
      [relation("node:x", "node:y", ["semantic"])],
    );

    expect(forest).toHaveLength(3);
    expect(
      new Set(
        forest.flatMap((item) => [item.sourceNodeId, item.targetNodeId]),
      ),
    ).toEqual(new Set(["node:a", "node:b", "node:c", "node:x", "node:y"]));
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

const relation = (
  sourceNodeId: string,
  targetNodeId: string,
  sharedTerms: readonly string[],
) => ({ sourceNodeId, targetNodeId, sharedTerms });
