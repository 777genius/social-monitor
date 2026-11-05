import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";

/** Independent critique controls; synthetic, never part of the frozen gold. */
export const releaseIdentityControls = [
  {
    "name": "positive_same_announcement_different_emphasis",
    "sameStory": true,
    "leftText": "OpenAI introduces GPT-9.1 for coding at lower cost\nOpenAI releases GPT-9.1 on September 1. GPT-9.1 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
    "rightText": "OpenAI launches GPT-9.1 for coding compared to its predecessor\nOpenAI releases GPT-9.1 on September 1. GPT-9.1 improves coding workloads vs its predecessor. The announcement describes the new model and its agentic tasks."
  },
  {
    "name": "negative_different_version_old_version_mentioned",
    "sameStory": false,
    "leftText": "OpenAI introduces GPT-9.1 for coding at lower cost\nOpenAI releases GPT-9.1 on September 1. GPT-9.1 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
    "rightText": "OpenAI releases GPT-9.2 for coding compared to GPT-9.1\nOpenAI releases GPT-9.2 on September 1. GPT-9.2 improves coding workloads vs GPT-9.1. The announcement describes the new model and its agentic tasks."
  },
  {
    "name": "negative_different_event_same_version",
    "sameStory": false,
    "leftText": "OpenAI introduces GPT-9.1 for coding at lower cost\nOpenAI releases GPT-9.1 on September 1. GPT-9.1 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
    "rightText": "OpenAI releases a GPT-9.1 watermark detector\nOpenAI releases a watermark detector for GPT-9.1 coding output on September 1. It identifies data leaks in copied output; this security tool is separate from the model announcement."
  },
  {
    "name": "negative_different_event_date_nearby_posts",
    "sameStory": false,
    "leftText": "OpenAI introduces GPT-9.1 for coding at lower cost\nOpenAI releases GPT-9.1 on September 1. GPT-9.1 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
    "rightText": "OpenAI released GPT-9.1 on August 1: a retrospective comparison\nOpenAI released GPT-9.1 on August 1. This comparison describes coding workloads a month later, rather than the new model announcement on September 1."
  },
  {
    "name": "negative_independent_benchmark_mentions_announcement",
    "sameStory": false,
    "leftText": "OpenAI introduces GPT-9.1 for coding at lower cost\nOpenAI releases GPT-9.1 on September 1. GPT-9.1 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
    "rightText": "Independent GPT-9.1 coding benchmark results\nOpenAI released GPT-9.1 on September 1. We now publish our own benchmark of coding workloads and agentic tasks. These measurements were performed by our lab after the announcement."
  },
  {
    "name": "negative_security_incident_mentions_announcement",
    "sameStory": false,
    "leftText": "OpenAI introduces GPT-9.1 for coding at lower cost\nOpenAI releases GPT-9.1 on September 1. GPT-9.1 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
    "rightText": "GPT-9.1 security exploit compromises a coding service\nOpenAI released GPT-9.1 on September 1. An attacker exploited a vulnerability in a separate coding service using the model. The incident concerns stolen credentials, not model availability."
  },
  {
    "name": "negative_future_release_rumour",
    "sameStory": false,
    "leftText": "OpenAI introduces GPT-9.1 for coding at lower cost\nOpenAI releases GPT-9.1 on September 1. GPT-9.1 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
    "rightText": "Will OpenAI release GPT-9.1 with lower coding costs?\nWe compare rumours that OpenAI will release GPT-9.1 on September 15. There is no confirmed announcement or available new model yet."
  },
  {
    "name": "negative_hypothetical_watermark_question",
    "sameStory": false,
    "leftText": "OpenAI introduces GPT-9.1 for coding at lower cost\nOpenAI releases GPT-9.1 on September 1. GPT-9.1 has lower cost for coding workloads. The announcement describes the new model and its agentic tasks.",
    "rightText": "Could GPT-9.1 output be watermarked after release?\nOpenAI released GPT-9.1 on September 1. We compare proposals for watermarking coding output and ask whether they might reduce data leaks. This is a question, not an announcement."
  }
] as const;

export const releaseEvidence = (
  text: string, feedItemId = "left", providerKey = "reddit",
): SummaryEvidenceItem => {
  const [title = "", ...body] = text.split("\n");
  return {
    feedItemId, providerKey, sourceItemId: `source:${feedItemId}`,
    sourceBindingId: `binding:${providerKey}`, interestId: "fixture-release",
    canonicalUrl: `https://${feedItemId}.example.test/post`, title,
    bodyPreview: body.join("\n"), sourceText: body.join("\n"),
    publishedAt: new Date("2026-09-01T12:00:00Z"),
    observedAt: new Date("2026-09-01T12:05:00Z"), score: 2, whyImportant: [],
  };
};
