import type { TopReadCandidate } from "../entities/top-read";
import { enrichTopReadCandidateDescriptions } from "./reader-summary-top-read-description-policy";

describe("reader summary top-read description policy", () => {
  it("reuses a detailed model description for a supplemental cited story", () => {
    const detailedSummary =
      "OpenAI said the GPT-5.6 family is starting to roll out across ChatGPT, Codex and the API. Early reports suggest availability may be incremental across plans and tools. The launch matters because it reaches consumer chat, coding workflows and API builders at the same time. Exact account availability should be checked before teams plan migrations around it.";
    const modelStory = story({
      id: "story:model-gpt-rollout",
      title: "GPT-5.6 starts rolling out",
      summary: detailedSummary,
      citationIds: ["c5", "c4"],
    });
    const supplementalStory = story({
      id: "story:supplemental-gpt-rollout",
      title: "Sol, Terra and Luna start rolling out in ChatGPT and Codex",
      summary: "First-party product announcement",
      citationIds: ["c5", "c6"],
    });

    const [enriched] = enrichTopReadCandidateDescriptions({
      candidates: [supplementalStory],
      modelStories: [modelStory],
    });

    expect(enriched?.summary).toBe(detailedSummary);
  });

  it("matches a supplemental project post to a model story by distinctive title terms", () => {
    const detailedSummary =
      "Several Hacker News launches show builders adapting tools around agents. Context.dev offers structured website data, while adjacent tools focus on code context and web automation. The practical implication is that agent infrastructure is becoming its own product layer. Durability and security remain open questions for these early tools.";
    const modelStory = story({
      id: "story:hn-agent-tools",
      title: "Hacker News builders explore agent tooling",
      summary: detailedSummary,
      citationIds: ["c40"],
    });
    const supplementalStory = story({
      id: "story:context-dev",
      title: "Context.dev API provides structured data from any website",
      summary: "The Hacker News source states that the project is available.",
      citationIds: ["c50"],
    });

    const [enriched] = enrichTopReadCandidateDescriptions({
      candidates: [supplementalStory],
      modelStories: [modelStory],
    });

    expect(enriched?.summary).toBe(detailedSummary);
  });

  it("keeps a short description when no model story is clearly related", () => {
    const supplementalStory = story({
      id: "story:shared-cluster",
      title: "Independent database release",
      summary: "A short but grounded source note.",
      citationIds: ["c90"],
    });

    const [enriched] = enrichTopReadCandidateDescriptions({
      candidates: [supplementalStory],
      modelStories: [
        story({
          id: "story:shared-cluster",
          title: "Claude usage recap",
          summary:
            "Anthropic introduced a monthly usage recap for Claude users. The feature shows activity patterns and offers quiet-hour controls. It matters as a product-retention and wellbeing feature rather than a core model change. Adoption and privacy tradeoffs remain uncertain until more users try it.",
          citationIds: ["c7"],
        }),
      ],
    });

    expect(enriched).toBe(supplementalStory);
  });

  it("does not reuse a promo-window description for a separate limit reset", () => {
    const limitReset = story({
      id: "story:limit-reset",
      title: "5 hour and weekly limits have been reset. Thanks Anthropic!",
      summary: "Reddit users report a fresh usage-limit reset.",
      citationIds: ["c23"],
    });
    const promoWindow = story({
      id: "story:fable-promo-window",
      title: "Fable July 12th disclaimer disappears from Claude Code",
      summary:
        "An HN-linked item noted that Claude Code messaging about Fable 5 weekly-limit access through July 12 seemed to disappear. The quoted text described Fable 5 drawing down usage faster than Opus and allowing part of weekly usage during the promotional period. The signal matters because provider limit language can change quickly. Check official support pages before assuming limits.",
      citationIds: ["c15"],
    });

    const [enriched] = enrichTopReadCandidateDescriptions({
      candidates: [limitReset],
      modelStories: [promoWindow],
    });

    expect(enriched).toBe(limitReset);
  });
});

const story = (params: {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly citationIds: readonly string[];
}): TopReadCandidate => ({
  storyClusterId: params.id,
  title: params.title,
  summary: params.summary,
  interestIds: ["ai-agents"],
  providerKeys: ["x-twitter"],
  citationIds: params.citationIds,
});
