import type { StoryRelationGoldenCase } from "../../domain";

export const STORY_RELATION_GOLDEN_DATASET_VERSION =
  "reader_summary.story_relation.golden.v2";

/** Frozen eval inputs only; these fixtures do not alter runtime topic behavior. */
export const storyRelationGoldenCases: readonly StoryRelationGoldenCase[] = [
  {
    caseId: "cursor-spacex-deployment",
    expected: "same_story",
    relatedOnlyHardNegative: false,
    left: {
      providerKey: "hacker-news",
      title: "Cursor deployed at SpaceX latest",
      bodyPreview:
        "An official note contains no copied announcement prose.",
    },
    right: {
      providerKey: "x-twitter",
      title: "SpaceX deploying Cursor for engineers",
      bodyPreview:
        "SpaceX confirms the deployment in separate wrapper metadata.",
    },
  },
  {
    caseId: "anthropic-watermark-announcement-and-explainer",
    expected: "same_story",
    relatedOnlyHardNegative: false,
    left: {
      providerKey: "x-twitter",
      title: "Anthropic details Claude watermark mechanism",
      bodyPreview:
        "Anthropic describes its native generated-output migration plan.",
    },
    right: {
      providerKey: "hacker-news",
      title: "Anthropic explains Claude watermark mechanism",
      bodyPreview:
        "The engineering team explains its verification pipeline.",
    },
  },
  {
    caseId: "confirmed-acquisition-announcement-and-report",
    expected: "same_story",
    relatedOnlyHardNegative: false,
    left: {
      providerKey: "x-twitter",
      title: "Acme announces confirmed Beta acquisition",
      bodyPreview: "Acme says the Beta acquisition completed after approval.",
    },
    right: {
      providerKey: "hacker-news",
      title: "Acme acquired Beta in confirmed deal",
      bodyPreview: "The report covers the completed Acme Beta acquisition.",
    },
  },
  {
    caseId: "claude-code-watermark-question-and-announcement",
    expected: "different_story",
    relatedOnlyHardNegative: true,
    left: {
      providerKey: "reddit",
      title: "Could watermarking Claude Code output happen?",
      bodyPreview:
        "A user asks a general product question without reporting the later announcement.",
    },
    right: {
      providerKey: "x-twitter",
      title: "Claude's snippets are watermarked",
      bodyPreview:
        "The official product announcement introduces a specific new rollout.",
    },
  },
  {
    caseId: "gpt-rollout-and-first-impressions",
    expected: "different_story",
    relatedOnlyHardNegative: true,
    left: {
      providerKey: "x-twitter",
      title: "OpenAI starts rolling out GPT-5.6 Sol",
      bodyPreview: "The release post describes availability in coding products.",
    },
    right: {
      providerKey: "reddit",
      title: "My first impressions of GPT-5.6 Sol",
      bodyPreview: "A user shares an opinion after trying the model.",
    },
  },
  {
    caseId: "fable-access-window-and-simulator",
    expected: "different_story",
    relatedOnlyHardNegative: true,
    left: {
      providerKey: "x-twitter",
      title: "Anthropic extends Fable 5 free access through July 19",
      bodyPreview: "The announcement extends a product access window.",
    },
    right: {
      providerKey: "reddit",
      title: "A simulator built with Claude Fable 5",
      bodyPreview: "A developer shows an unrelated application built with the product.",
    },
  },
  {
    caseId: "kimi-inference-report-and-android-oauth-patch",
    expected: "different_story",
    relatedOnlyHardNegative: true,
    left: {
      providerKey: "reddit",
      title: "Researchers report a Kimi K3 prompt injection exposure",
      bodyPreview: "The report covers crafted instructions in hosted inference.",
    },
    right: {
      providerKey: "hacker-news",
      title: "Kimi K3 Android OAuth package fixes callback validation",
      bodyPreview: "The mobile patch rejects malformed sign-in redirect URIs.",
    },
  },
  {
    caseId: "claude-code-automation-launch-and-cache-update",
    expected: "different_story",
    relatedOnlyHardNegative: true,
    left: {
      providerKey: "x-twitter",
      title: "Keystroke introduces an n8n alternative for Cursor and Codex",
      bodyPreview: "A third-party developer introduces workflow orchestration.",
    },
    right: {
      providerKey: "hacker-news",
      title: "Claude Code session cache update changes local startup",
      bodyPreview: "Cache invalidation changes local process initialization.",
    },
  },
];
