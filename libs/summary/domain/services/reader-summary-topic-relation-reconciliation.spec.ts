import { reconcileVerifiedReaderSummaryTopicRelations } from "./reader-summary-topic-relation-reconciliation";

describe("reconcileVerifiedReaderSummaryTopicRelations", () => {
  it("unifies high-confidence compatible verified relations", () => {
    const result = reconcileVerifiedReaderSummaryTopicRelations({
      labelPlan: plan("release", "OpenAI"),
      candidates: [relation()],
      decisions: [{ ...relation(), sameTopic: true, confidenceScore: 0.94 }],
    });

    expect(result.nodeLabels.map((label) => label.topicId)).toEqual([
      "topic:chatgpt-work",
      "topic:chatgpt-work",
    ]);
    expect(result.warnings).toContain(
      "1 topic relations were reviewed and 1 were verified by focused semantic review",
    );
  });

  it("rejects low-confidence, unknown, and claim-incompatible merges", () => {
    const result = reconcileVerifiedReaderSummaryTopicRelations({
      labelPlan: plan("release", "OpenAI", "comparison"),
      candidates: [relation()],
      decisions: [
        { ...relation(), sameTopic: true, confidenceScore: 0.99 },
        {
          sourceNodeId: "node:a",
          targetNodeId: "node:unknown",
          sameTopic: true,
          confidenceScore: 0.99,
        },
      ],
    });

    expect(result.nodeLabels.map((label) => label.topicId)).toEqual([
      "topic:chatgpt-work",
      "topic:codex-work",
    ]);
    expect(result.warnings).toEqual([
      "2 topic relations were reviewed and 0 were verified by focused semantic review",
    ]);
  });

  it("splits an existing LLM merge when focused review rejects it", () => {
    const labelPlan = plan("release", "OpenAI");
    const mergedPlan = {
      ...labelPlan,
      nodeLabels: labelPlan.nodeLabels.map((label) => ({
        ...label,
        topicId: "topic:work",
      })),
    };
    const result = reconcileVerifiedReaderSummaryTopicRelations({
      labelPlan: mergedPlan,
      candidates: [relation()],
      decisions: [{ ...relation(), sameTopic: false, confidenceScore: 0.95 }],
    });

    expect(new Set(result.nodeLabels.map((label) => label.topicId)).size).toBe(
      2,
    );
    expect(result.warnings).toEqual([
      "1 topic relations were reviewed and 0 were verified by focused semantic review",
    ]);
  });

  it("uses an explicit fail-closed warning when verification is unavailable", () => {
    const labelPlan = plan("release", "OpenAI");
    const result = reconcileVerifiedReaderSummaryTopicRelations({
      labelPlan: {
        ...labelPlan,
        nodeLabels: labelPlan.nodeLabels.map((label) => ({
          ...label,
          topicId: "topic:work",
        })),
      },
      candidates: [relation()],
      decisions: [],
      verificationWarning: "Relations unavailable; topics kept separate",
    });

    expect(new Set(result.nodeLabels.map((label) => label.topicId)).size).toBe(
      2,
    );
    expect(result.warnings).toEqual([
      "Relations unavailable; topics kept separate",
    ]);
  });
});

const relation = () => ({
  sourceNodeId: "node:a",
  targetNodeId: "node:b",
  sharedTerms: ["codex", "work"],
});

const plan = (
  sourceClaim: "release" | "comparison",
  parentSubject: string,
  targetClaim: "release" | "comparison" = sourceClaim,
) => ({
  nodeLabels: [
    label("node:a", "topic:chatgpt-work", sourceClaim, parentSubject),
    label("node:b", "topic:codex-work", targetClaim, parentSubject),
  ],
  groups: [],
});

const label = (
  nodeId: string,
  topicId: string,
  claimType: "release" | "comparison",
  parentSubject: string,
) => ({
  nodeId,
  topicId,
  label: nodeId,
  semantic: {
    subject: nodeId,
    parentSubject,
    claimType,
    confidenceScore: 0.9,
  },
});
