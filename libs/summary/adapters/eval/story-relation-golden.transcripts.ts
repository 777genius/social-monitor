/**
 * Frozen synthetic runtime transcripts. They were written from the evidence
 * wording alone and deliberately contain no golden labels or expected metrics.
 */
export type FrozenStoryRelationTranscript = {
  readonly transcriptId: string;
  readonly pair: {
    readonly leftFeedItemId: string;
    readonly rightFeedItemId: string;
  };
  readonly structuredOutput: Record<string, unknown>;
};

export const frozenStoryRelationTranscripts: readonly FrozenStoryRelationTranscript[] = [
  {
    transcriptId: "synthetic-runtime-001",
    pair: {
      leftFeedItemId: "cursor-spacex-deployment:left",
      rightFeedItemId: "cursor-spacex-deployment:right",
    },
    structuredOutput: {
      decisions: [
        {
          leftFeedItemId: "cursor-spacex-deployment:left",
          rightFeedItemId: "cursor-spacex-deployment:right",
          sameStory: true,
          confidenceScore: 0.98,
          rationale:
            "Both reports describe the same Cursor deployment announcement at SpaceX.",
        },
      ],
    },
  },
  {
    transcriptId: "synthetic-runtime-002",
    pair: {
      leftFeedItemId:
        "anthropic-watermark-announcement-and-explainer:left",
      rightFeedItemId:
        "anthropic-watermark-announcement-and-explainer:right",
    },
    structuredOutput: {
      decisions: [
        {
          leftFeedItemId:
            "anthropic-watermark-announcement-and-explainer:left",
          rightFeedItemId:
            "anthropic-watermark-announcement-and-explainer:right",
          sameStory: true,
          confidenceScore: 0.98,
          rationale:
            "The explainer explicitly covers the mechanism introduced by the same announcement.",
        },
      ],
    },
  },
  {
    transcriptId: "synthetic-runtime-008",
    pair: {
      leftFeedItemId: "confirmed-acquisition-announcement-and-report:left",
      rightFeedItemId: "confirmed-acquisition-announcement-and-report:right",
    },
    structuredOutput: {
      decisions: [{
        leftFeedItemId: "confirmed-acquisition-announcement-and-report:left",
        rightFeedItemId: "confirmed-acquisition-announcement-and-report:right",
        sameStory: true,
        confidenceScore: 0.99,
        rationale: "Both report the same confirmed Acme acquisition of Beta.",
      }],
    },
  },
  {
    transcriptId: "synthetic-runtime-003",
    pair: {
      leftFeedItemId:
        "claude-code-watermark-question-and-announcement:left",
      rightFeedItemId:
        "claude-code-watermark-question-and-announcement:right",
    },
    structuredOutput: {
      decisions: [
        {
          leftFeedItemId:
            "claude-code-watermark-question-and-announcement:left",
          rightFeedItemId:
            "claude-code-watermark-question-and-announcement:right",
          sameStory: false,
          confidenceScore: 0.98,
          rationale:
            "A general earlier user question is not the later product rollout announcement.",
        },
      ],
    },
  },
  {
    transcriptId: "synthetic-runtime-004",
    pair: {
      leftFeedItemId:
        "gpt-rollout-and-first-impressions:left",
      rightFeedItemId:
        "gpt-rollout-and-first-impressions:right",
    },
    structuredOutput: {
      decisions: [
        {
          leftFeedItemId:
            "gpt-rollout-and-first-impressions:left",
          rightFeedItemId:
            "gpt-rollout-and-first-impressions:right",
          sameStory: false,
          confidenceScore: 0.98,
          rationale:
            "A personal trial reaction is a separate event from the availability release post.",
        },
      ],
    },
  },
  {
    transcriptId: "synthetic-runtime-005",
    pair: {
      leftFeedItemId: "fable-access-window-and-simulator:left",
      rightFeedItemId: "fable-access-window-and-simulator:right",
    },
    structuredOutput: {
      decisions: [
        {
          leftFeedItemId: "fable-access-window-and-simulator:left",
          rightFeedItemId:
            "fable-access-window-and-simulator:right",
          sameStory: false,
          confidenceScore: 0.98,
          rationale:
            "An access-window extension and an application showcase are distinct events.",
        },
      ],
    },
  },
  {
    transcriptId: "synthetic-runtime-006",
    pair: {
      leftFeedItemId: "kimi-inference-report-and-android-oauth-patch:left",
      rightFeedItemId: "kimi-inference-report-and-android-oauth-patch:right",
    },
    structuredOutput: {
      decisions: [
        {
          leftFeedItemId: "kimi-inference-report-and-android-oauth-patch:left",
          rightFeedItemId: "kimi-inference-report-and-android-oauth-patch:right",
          sameStory: false,
          confidenceScore: 0.98,
          rationale:
            "The hosted prompt-injection report and Android OAuth patch concern different incidents.",
        },
      ],
    },
  },
  {
    transcriptId: "synthetic-runtime-007",
    pair: {
      leftFeedItemId: "claude-code-automation-launch-and-cache-update:left",
      rightFeedItemId: "claude-code-automation-launch-and-cache-update:right",
    },
    structuredOutput: {
      decisions: [
        {
          leftFeedItemId:
            "claude-code-automation-launch-and-cache-update:left",
          rightFeedItemId:
            "claude-code-automation-launch-and-cache-update:right",
          sameStory: false,
          confidenceScore: 0.98,
          rationale:
            "A third-party automation launch is distinct from a separate cache update.",
        },
      ],
    },
  },
];
