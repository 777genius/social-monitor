import { STORY_RANKING_POLICY_V1 } from "../policies/story-ranking-policy";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { storyKey } from "./story-key-normalizer";

describe("storyKey repository text identity", () => {
  it.each([
    {
      title: "github/tooling adds package shortcuts",
      bodyPreview: "Maintainers describe an ordinary developer workflow.",
    },
    {
      title:
        "Android package read/write behavior differs in this GitHub repository",
      bodyPreview: "The setting controls storage access on mobile devices.",
    },
    {
      title: "MCP client/server OAuth flow in a GitHub repository",
      bodyPreview: "Operators compare tool authorization controls.",
    },
    {
      title: "OAuth client/secret rotation for the GitHub repository",
      bodyPreview: "The guide explains account callbacks and scopes.",
    },
    {
      title: "Package scope/name metadata from a GitHub repository",
      bodyPreview: "The registry guide explains dependency resolution.",
    },
  ])("does not infer a repository from ambiguous slash text: $title", (input) => {
    expect(storyKey(evidence(input), STORY_RANKING_POLICY_V1)).not.toMatch(
      /^github-repo:/u,
    );
  });

  it("does not borrow repository context from another evidence field", () => {
    const item = evidence({
      title: "Android read/write behavior changed after reboot",
      bodyPreview:
        "The GitHub repository discussion compares device settings.",
    });

    expect(storyKey(item, STORY_RANKING_POLICY_V1)).not.toMatch(
      /^github-repo:/u,
    );
  });

  it("accepts one explicitly described bare repository", () => {
    const title = "The GitHub repository openai/codex is gaining adoption";

    expect(storyKey(evidence({ title }), STORY_RANKING_POLICY_V1)).toBe(
      "github-repo:openai/codex",
    );
  });

  it("fails closed when text describes more than one bare repository", () => {
    const item = evidence({
      title:
        "Compare GitHub repository openai/codex with GitHub repository acme/tools",
    });

    expect(storyKey(item, STORY_RANKING_POLICY_V1)).not.toMatch(
      /^github-repo:/u,
    );
  });

  it("keeps an explicit github.com identity despite unrelated slash syntax", () => {
    const item = evidence({
      title:
        "OAuth client/secret setup references https://github.com/OpenAI/Codex",
    });

    expect(storyKey(item, STORY_RANKING_POLICY_V1)).toBe(
      "github-repo:openai/codex",
    );
  });

  it("fails closed when text contains conflicting explicit github.com URLs", () => {
    const item = evidence({
      title:
        "Compare https://github.com/openai/codex with https://github.com/acme/tools",
    });

    expect(storyKey(item, STORY_RANKING_POLICY_V1)).not.toMatch(
      /^github-repo:/u,
    );
  });
});

const evidence = (params: {
  readonly title: string;
  readonly bodyPreview?: string;
}): SummaryEvidenceItem => ({
  feedItemId: `feed:${params.title}`,
  sourceItemId: `source:${params.title}`,
  sourceBindingId: "binding:test",
  interestId: "ai-agents",
  providerKey: "reddit",
  canonicalUrl: "https://example.test/story",
  title: params.title,
  bodyPreview: params.bodyPreview,
  publishedAt: new Date("2026-07-21T12:00:00.000Z"),
  observedAt: new Date("2026-07-21T12:01:00.000Z"),
  score: 1,
  whyImportant: ["Reviewer identity probe"],
});
