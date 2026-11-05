import { evaluateStoryRelationGoldenCases } from "../../domain";
import type {
  AgentRuntimeClientPort,
  AgentRuntimeHealthResult,
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
} from "../../ports";
import { withTestExecutionAttestation } from "../model/reader-summary-execution-attestation.spec-support";
import {
  STORY_RELATION_GOLDEN_DATASET_VERSION,
  storyRelationGoldenCases,
} from "./story-relation-golden.fixtures";
import { runStoryRelationGoldenBaseline } from "./story-relation-golden-harness";
import {
  frozenStoryRelationTranscripts,
  type FrozenStoryRelationTranscript,
} from "./story-relation-golden.transcripts";

describe("story relation golden eval", () => {
  it("freezes named positives and retains related-only hard negatives", () => {
    expect(storyRelationGoldenCases.map((evalCase) => evalCase.caseId)).toEqual([
      "cursor-spacex-deployment",
      "anthropic-watermark-announcement-and-explainer",
      "claude-code-watermark-question-and-announcement",
      "gpt-rollout-and-first-impressions",
      "fable-access-window-and-simulator",
      "kimi-inference-report-and-android-oauth-patch",
      "claude-code-automation-launch-and-cache-update",
    ]);
    expect(
      storyRelationGoldenCases.filter((evalCase) => evalCase.expected === "same_story"),
    ).toHaveLength(2);
    expect(
      storyRelationGoldenCases.filter(
        (evalCase) => evalCase.relatedOnlyHardNegative,
      ),
    ).toHaveLength(5);
  });

  it("keeps frozen runtime transcripts separate from label-bearing eval data", () => {
    expect(
      frozenStoryRelationTranscripts.map((transcript) =>
        transcript.pair.leftFeedItemId.replace(/:left$/, ""),
      ),
    ).toEqual(storyRelationGoldenCases.map((evalCase) => evalCase.caseId));

    const serializedTranscripts = JSON.stringify(
      frozenStoryRelationTranscripts,
    );
    expect(serializedTranscripts).not.toContain('"expected"');
    expect(serializedTranscripts).not.toContain("same_story");
    expect(serializedTranscripts).not.toContain("different_story");
    expect(serializedTranscripts).not.toContain("hard-negative");
    expect(serializedTranscripts).not.toContain("positive");
  });

  it("evaluates authoritative candidates once through the production adapter", async () => {
    const client = new RecordedGoldenAgentRuntimeClient();
    const result = await runStoryRelationGoldenBaseline({
      datasetVersion: STORY_RELATION_GOLDEN_DATASET_VERSION,
      cases: storyRelationGoldenCases,
      client,
    });

    expect(result.caseResults.map((caseResult) => caseResult.caseId)).toEqual(
      storyRelationGoldenCases.map((evalCase) => evalCase.caseId),
    );
    expect(result.metrics).toEqual({
      truePositiveCount: 2,
      falsePositiveCount: 0,
      falseNegativeCount: 0,
      trueNegativeCount: 5,
      precision: 1,
      recall: 1,
      relatedOnlyFalseMergeCount: 0,
    });
    expect(client.requestedCaseIds).toContain(
      "claude-code-watermark-question-and-announcement",
    );
    expect(client.primaryRequestedCaseIds).toEqual([
      "cursor-spacex-deployment",
      "anthropic-watermark-announcement-and-explainer",
      "claude-code-watermark-question-and-announcement",
    ]);
    expect(client.shadowRequestedCaseIds).toEqual([]);
  });

  it("omits undefined precision and recall denominators", () => {
    const negativeOnly = storyRelationGoldenCases.filter(
      (evalCase) => evalCase.expected === "different_story",
    );
    const result = evaluateStoryRelationGoldenCases({
      datasetVersion: STORY_RELATION_GOLDEN_DATASET_VERSION,
      cases: negativeOnly,
      predictions: negativeOnly.map((evalCase) => ({
        caseId: evalCase.caseId,
        sameStory: false,
      })),
    });

    expect(result.metrics).toEqual({
      truePositiveCount: 0,
      falsePositiveCount: 0,
      falseNegativeCount: 0,
      trueNegativeCount: 5,
      relatedOnlyFalseMergeCount: 0,
    });
  });

  it("rejects partial, duplicate, or unknown prediction sets", () => {
    const firstCaseId = storyRelationGoldenCases[0]!.caseId;
    const evaluate = (caseId: string) =>
      evaluateStoryRelationGoldenCases({
        datasetVersion: STORY_RELATION_GOLDEN_DATASET_VERSION,
        cases: storyRelationGoldenCases,
        predictions: [
          { caseId: firstCaseId, sameStory: true },
          { caseId, sameStory: false },
        ],
      });

    expect(() => evaluate(firstCaseId)).toThrow("must match each case once");
    expect(() => evaluate("unknown-case")).toThrow("must match each case once");
    expect(() =>
      evaluateStoryRelationGoldenCases({
        datasetVersion: STORY_RELATION_GOLDEN_DATASET_VERSION,
        cases: storyRelationGoldenCases,
        predictions: [],
      }),
    ).toThrow("must match each case once");
  });
});

class RecordedGoldenAgentRuntimeClient implements AgentRuntimeClientPort {
  readonly requestedCaseIds: string[] = [];
  readonly primaryRequestedCaseIds: string[] = [];
  readonly shadowRequestedCaseIds: string[] = [];

  async runTask(
    command: AgentRuntimeTaskCommand,
  ): Promise<AgentRuntimeTaskResult> {
    const prompt = JSON.parse(command.prompt) as {
      readonly pairs: readonly {
        readonly leftFeedItemId: string;
        readonly rightFeedItemId: string;
      }[];
    };
    const caseIds = prompt.pairs.map((pair) =>
      pair.leftFeedItemId.replace(/:left$/, ""),
    );
    this.requestedCaseIds.push(...caseIds);
    if (command.metadata?.verificationLane === "safe_recall_shadow") {
      this.shadowRequestedCaseIds.push(...caseIds);
    } else {
      this.primaryRequestedCaseIds.push(...caseIds);
    }
    const transcript = transcriptFor(prompt.pairs);
    return withTestExecutionAttestation(command, {
      status: "completed",
      structuredOutput: transcript.structuredOutput,
      warnings: [],
    });
  }

  async checkHealth(): Promise<AgentRuntimeHealthResult> {
    return {
      status: "serving",
      runtimeEngine: "recorded-test-runtime",
      runtimeVersion: "1",
      warnings: [],
    };
  }
}

const transcriptFor = (
  pairs: readonly FrozenStoryRelationTranscript["pair"][],
): FrozenStoryRelationTranscript => {
  if (pairs.length !== 1) {
    throw new Error("Frozen story relation transcript expects exactly one pair");
  }
  const pair = pairs[0]!;
  const transcript = frozenStoryRelationTranscripts.find(
    (candidate) =>
      candidate.pair.leftFeedItemId === pair.leftFeedItemId &&
      candidate.pair.rightFeedItemId === pair.rightFeedItemId,
  );
  if (transcript === undefined) {
    throw new Error("No frozen story relation transcript matches the runtime prompt");
  }
  return transcript;
};
