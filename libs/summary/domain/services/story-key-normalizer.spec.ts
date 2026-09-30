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

describe("storyKey canonical URL query identity", () => {
  it("keeps different article editions distinct without exposing query values", () => {
    const first = storyKey(
      evidence({
        title: "Article",
        canonicalUrl: "https://example.test/article?edition=alpha",
      }),
      STORY_RANKING_POLICY_V1,
    );
    const second = storyKey(
      evidence({
        title: "Article",
        canonicalUrl: "https://example.test/article?edition=beta",
      }),
      STORY_RANKING_POLICY_V1,
    );

    expect(first).not.toBe(second);
    expect(first).toMatch(/^url:example\.test\/article\?q=[a-f0-9]{64}$/u);
    expect(second).toMatch(/^url:example\.test\/article\?q=[a-f0-9]{64}$/u);
  });

  it("dedupes the same edition across parameter order, tracking, and fragments", () => {
    const first = storyKey(
      evidence({
        title: "Article",
        canonicalUrl:
          "https://example.test/article?edition=alpha&lang=en&utm_source=feed#one",
      }),
      STORY_RANKING_POLICY_V1,
    );
    const second = storyKey(
      evidence({
        title: "Article",
        canonicalUrl:
          "https://www.example.test/article?fbclid=click&lang=en&edition=alpha#two",
      }),
      STORY_RANKING_POLICY_V1,
    );

    expect(first).toBe(second);
  });

  it("preserves repeated value order while sorting distinct parameter names", () => {
    const keyFor = (query: string): string =>
      storyKey(
        evidence({
          title: "Lookup",
          canonicalUrl: `https://example.test/lookup?${query}`,
        }),
        STORY_RANKING_POLICY_V1,
      );

    expect(keyFor("id=1&id=2&lang=en")).toBe(
      keyFor("lang=en&id=1&id=2"),
    );
    expect(keyFor("id=1&id=2&lang=en")).not.toBe(
      keyFor("lang=en&id=2&id=1"),
    );
  });

  it("ignores X share parameters only on X status URLs", () => {
    const keyFor = (url: string): string =>
      storyKey(evidence({ title: "Status", canonicalUrl: url }), STORY_RANKING_POLICY_V1);

    expect(keyFor("https://twitter.com/author/status/123?s=20")).toBe(
      keyFor("https://x.com/author/status/123"),
    );
    expect(keyFor("https://x.com/author/status/123?ref_src=twsrc%5Etfw&access_token=synthetic-marker-only"))
      .toBe(keyFor("https://x.com/author/status/123"));
    expect(keyFor("https://example.test/author/status/123?s=20")).not.toBe(
      keyFor("https://example.test/author/status/123"),
    );
  });

  it("ignores YouTube share parameters but keeps video and other IDs distinct", () => {
    const keyFor = (url: string): string =>
      storyKey(evidence({ title: "Video", canonicalUrl: url }), STORY_RANKING_POLICY_V1);

    expect(keyFor("https://youtube.com/watch?v=alpha&si=fixture-share")).toBe(
      keyFor("https://www.youtube.com/watch?v=alpha"),
    );
    expect(keyFor("https://youtu.be/alpha?si=fixture-share&access_token=synthetic-marker-only"))
      .toBe(keyFor("https://youtu.be/alpha"));
    expect(keyFor("https://youtube.com/watch?v=alpha")).not.toBe(
      keyFor("https://youtube.com/watch?v=beta"),
    );
    expect(keyFor("https://youtube.com/watch?v=alpha&list=one")).not.toBe(
      keyFor("https://youtube.com/watch?v=alpha&list=two"),
    );
    expect(keyFor("https://example.test/watch?v=alpha&si=fixture-share")).not.toBe(
      keyFor("https://example.test/watch?v=alpha"),
    );
  });

  it("keeps tracking-only URLs on their existing path identity", () => {
    const tracked = storyKey(
      evidence({
        title: "Article",
        canonicalUrl:
          "https://example.test/article?utm_source=feed&ref=share#part",
      }),
      STORY_RANKING_POLICY_V1,
    );
    const plain = storyKey(
      evidence({
        title: "Article",
        canonicalUrl: "https://example.test/article",
      }),
      STORY_RANKING_POLICY_V1,
    );

    expect(tracked).toBe(plain);
    expect(plain).toBe("url:example.test/article");
  });

  it("preserves Hacker News item identity across tracking and page variants", () => {
    const first = storyKey(
      evidence({
        title: "HN item",
        canonicalUrl:
          "https://news.ycombinator.com/item?id=987&utm_source=feed",
      }),
      STORY_RANKING_POLICY_V1,
    );
    const second = storyKey(
      evidence({
        title: "HN item",
        canonicalUrl: "https://news.ycombinator.com/item?p=2&id=987",
      }),
      STORY_RANKING_POLICY_V1,
    );

    expect(first).toBe("url:news.ycombinator.com/item/987");
    expect(second).toBe(first);
  });

  it('keeps repeated Hacker News ids in order instead of collapsing to the first id', () => {
    const keyFor = (query: string) => storyKey(evidence({
      title: 'HN item', canonicalUrl: `https://news.ycombinator.com/item?${query}`,
    }), STORY_RANKING_POLICY_V1);
    expect(keyFor('id=1&id=2')).not.toBe(keyFor('id=2&id=1'));
    expect(keyFor('id=1&id=2')).not.toBe(keyFor('id=1'));
  });

  it("does not expose malformed Hacker News item IDs", () => {
    const key = storyKey(
      evidence({
        title: "HN item",
        canonicalUrl: "https://news.ycombinator.com/item?id=opaque-value",
      }),
      STORY_RANKING_POLICY_V1,
    );

    expect(key).toMatch(/^url:news\.ycombinator\.com\/item\?q=[a-f0-9]{64}$/u);
  });

  it("preserves GitHub repository identity and known redirect unwrapping", () => {
    const direct = storyKey(
      evidence({
        title: "Repository",
        canonicalUrl: "https://github.com/OpenAI/Codex?edition=alpha",
      }),
      STORY_RANKING_POLICY_V1,
    );
    const redirected = storyKey(
      evidence({
        title: "Repository",
        canonicalUrl:
          "https://www.google.com/url?q=https%3A%2F%2Fgithub.com%2Fopenai%2Fcodex%3Fedition%3Dbeta",
      }),
      STORY_RANKING_POLICY_V1,
    );

    expect(direct).toBe("github-repo:openai/codex");
    expect(redirected).toBe(direct);
  });

  it("keeps an unwrapped article's query identity", () => {
    const direct = storyKey(
      evidence({
        title: "Article",
        canonicalUrl: "https://example.com/article?edition=alpha",
      }),
      STORY_RANKING_POLICY_V1,
    );
    const redirected = storyKey(
      evidence({
        title: "Article",
        canonicalUrl:
          "https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Farticle%3Fedition%3Dalpha",
      }),
      STORY_RANKING_POLICY_V1,
    );

    expect(redirected).toBe(direct);
  });

  it("rejects unsafe redirect targets without exposing their query", () => {
    const key = storyKey(
      evidence({
        title: "Unsafe redirect",
        canonicalUrl:
          "https://www.google.com/url?q=http%3A%2F%2F127.0.0.1%2Fadmin%3Ftoken%3Dopaque",
      }),
      STORY_RANKING_POLICY_V1,
    );

    expect(key).toBe("url:google.com/url");
  });
});

const evidence = (params: {
  readonly title: string;
  readonly bodyPreview?: string;
  readonly canonicalUrl?: string;
}): SummaryEvidenceItem => ({
  feedItemId: `feed:${params.title}`,
  sourceItemId: `source:${params.title}`,
  sourceBindingId: "binding:test",
  interestId: "ai-agents",
  providerKey: "reddit",
  canonicalUrl: params.canonicalUrl ?? "https://example.test/story",
  title: params.title,
  bodyPreview: params.bodyPreview,
  publishedAt: new Date("2026-07-21T12:00:00.000Z"),
  observedAt: new Date("2026-07-21T12:01:00.000Z"),
  score: 1,
  whyImportant: ["Reviewer identity probe"],
});
