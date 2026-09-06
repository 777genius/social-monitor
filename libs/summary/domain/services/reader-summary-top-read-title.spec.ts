import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { buildTopReadTitle } from "./reader-summary-top-read-title";
import { buildReaderPostPromotionTitle, hasReaderFacingPromotionTitle } from
  "./reader-post-promotion-title";
import { isUnpolishedReaderTitle } from
  "../policies/reader-summary-reader-facing-text-policy";

describe("reader summary top read title", () => {
  it.each([118, 119, 120, 139, 140, 141])(
    "keeps the title length contract at %i characters without clipping clauses",
    (length) => {
      const prefix = "Atlas publishes detailed agent safety findings for ";
      const sentence = prefix + "x".repeat(length - prefix.length);
      const next = "Atlas documents agent failures in public incident reports";
      const item = evidence({
        title: `X post by @lab: ${sentence}...`,
        bodyPreview: `${sentence}. ${next}.`,
      });

      expect(isUnpolishedReaderTitle(sentence)).toBe(length >= 120);
      expect(buildReaderPostPromotionTitle({ lead: item }))
        .toBe(length < 120 ? sentence : next);
      expect(hasReaderFacingPromotionTitle(item)).toBe(true);
    },
  );

  it("uses a complete sentence from the reported incident discussion", () => {
    const body = "How we think about the “wiki incident,” where our agents wrote to several internet sites: it’s past time for us to define standards for when and how we share misalignment incidents, not just misalignment properties of our models. Historically, we have treated misalignment largely as a research question, which gets communicated in research publications such as systems cards. This year, we’ve started to see misalignment cause new types of real-world impact.";
    const item = evidence({ title: body, bodyPreview: body });
    expect(buildReaderPostPromotionTitle({ lead: item })).toBe(
      "This year, we’ve started to see misalignment cause new types of real-world impact",
    );
    expect(hasReaderFacingPromotionTitle(item)).toBe(true);
  });

  it.each(["", "...", "…"])("does not turn an unfinished later preview into a title (%s)", (ending) => {
    const first = "Atlas documents agent safety findings across public websites and proposes reporting standards for misalignment incidents and model properties";
    const body = `${first}. Atlas allows automatic writes only after${ending}`;
    const item = evidence({
      title: `X post by @lab: ${first}...`,
      bodyPreview: body,
    });
    expect(hasReaderFacingPromotionTitle(item)).toBe(false);
  });

  it.each([
    "Current AI product discussion",
    "Here we go again!",
    "I am thinking about agent safety",
    "Check this out!",
    "Atlas enables automatic agent writes, but only after operators review every proposed change and explicitly approve the destination site",
    "Atlas enables automatic agent writes; the feature remains disabled unless operators review every change and explicitly approve the destination site",
    "Atlas enables automatic agent writes: only after operators review every proposed change and explicitly approve the destination site",
  ])("does not admit generic, conversational or incomplete titles: %s", (body) => {
    const item = evidence({ title: body, bodyPreview: body });
    expect(hasReaderFacingPromotionTitle(item)).toBe(false);
  });

  it("does not drop an unverified breaking qualifier to fit a later sentence", () => {
    const body = "BREAKING: Atlas allegedly plans automatic agent writes across many public sites without operator review or explicit destination approval. Atlas enables automatic agent writes.";
    const item = evidence({ title: body, bodyPreview: body });
    expect(hasReaderFacingPromotionTitle(item)).toBe(false);
    expect(hasReaderFacingPromotionTitle({
      ...item,
      bodyPreview: body.replace(/^BREAKING: /u, ""),
    })).toBe(false);
  });

  it("replaces a mostly non-English model title with an English summary title", () => {
    const title = buildTopReadTitle({
      storyTitle:
        "Anthropic、『Fable 5』の無償アクセスと『Claude Code』利用上限50%増を7月19日まで延長 https://t.co/example",
      storySummary:
        "An X post says Anthropic extended Fable 5 free access and increased Claude Code usage limits by 50% through July 19. The post does not settle what happens after July 19.",
      primaryEvidence: evidence({
        providerKey: "x-twitter",
        title:
          "X post by @watcher: Anthropic、『Fable 5』の無償アクセスと『Claude Code』利用上限50%増を7月19日まで延長",
      }),
      evidence: [],
    });

    expect(title).toBe(
      "Anthropic extended Fable 5 free access and increased Claude Code usage limits by 50% through July 19",
    );
  });

  it("keeps an English model title that includes a short product name", () => {
    const title = buildTopReadTitle({
      storyTitle: "Claude Code extends Fable 5 access through July 19",
      storySummary: "An X post reports the access extension.",
      primaryEvidence: evidence({ providerKey: "x-twitter" }),
      evidence: [],
    });

    expect(title).toBe("Claude Code extends Fable 5 access through July 19");
  });

  it("rejects a non-English native title when the generated summary is English", () => {
    const title = buildTopReadTitle({
      storyTitle: "Strong source engagement signal",
      storySummary:
        "The report says Anthropic extended Claude Code access through July 19.",
      primaryEvidence: evidence({
        providerKey: "rss",
        title: "AnthropicがClaude Codeの利用上限を7月19日まで延長",
      }),
      evidence: [],
    });

    expect(title).toBe("Anthropic extended Claude Code access through July 19");
  });

  it("removes a trailing source URL from an otherwise useful title", () => {
    const title = buildTopReadTitle({
      storyTitle:
        "Anthropic extends Claude Code access through July 19 https://t.co/example",
      storySummary: "Anthropic extended access for Claude Code users.",
      primaryEvidence: evidence({ providerKey: "x-twitter" }),
      evidence: [],
    });

    expect(title).toBe("Anthropic extends Claude Code access through July 19");
  });

  it("replaces a generic native social hook with the grounded story title", () => {
    const title = buildTopReadTitle({
      storyTitle: "Claude Code users question another access extension",
      storySummary:
        "Claude Code users questioned whether another temporary access extension changes their long-term subscription plans.",
      primaryEvidence: evidence({
        providerKey: "reddit",
        title: "Here we go again!!!",
      }),
      evidence: [],
    });

    expect(title).toBe("Claude Code users question another access extension");
  });

  it.each([
    {
      sourceTitle: "Nice Work OpenAI",
      summary:
        "OpenAI introduced a lower-cost business plan for teams with a two-seat minimum.",
      expected:
        "OpenAI introduced a lower-cost business plan for teams with a two-seat minimum",
    },
    {
      sourceTitle: "I am unsure what I gave my copilot to make it hallucinate?",
      summary:
        "GitHub Copilot hallucinated a nonexistent package while proposing a dependency change.",
      expected:
        "GitHub Copilot hallucinated a nonexistent package while proposing a dependency change",
    },
    {
      sourceTitle:
        "New $100 Business Plan (2 seat minimum). They finally did it. My team just switched over. This is why 5h limits are back.",
      summary:
        "OpenAI's new business plan costs $100 and requires at least two seats.",
      expected:
        "OpenAI's new business plan costs $100 and requires at least two seats",
    },
  ])(
    "derives a concrete title from evidence text for an unpolished source hook",
    ({ sourceTitle, summary, expected }) => {
      const title = buildTopReadTitle({
        storyTitle: sourceTitle,
        storySummary: summary,
        primaryEvidence: evidence({
          providerKey: "reddit",
          title: sourceTitle,
          bodyPreview: summary,
        }),
        evidence: [],
      });

      expect(title).toBe(expected);
    },
  );

  it("repairs an obvious agreement error in a native English title", () => {
    const title = buildTopReadTitle({
      storyTitle: "AI research productivity study",
      storySummary:
        "A study says AI boosts research careers while narrowing the span of ideas explored.",
      primaryEvidence: evidence({
        providerKey: "hacker-news",
        title:
          "AI boosts research careers but narrow the span of ideas explored: study",
      }),
      evidence: [],
    });

    expect(title).toBe(
      "AI boosts research careers but narrows the span of ideas explored: study",
    );
  });

  it("does not rewrite an imperative title with a different subject", () => {
    const title = buildTopReadTitle({
      storyTitle: "AI deployment scope guidance",
      storySummary:
        "The guidance says AI boosts productivity but recommends narrowing deployment scope.",
      primaryEvidence: evidence({
        providerKey: "hacker-news",
        title: "AI boosts productivity, but narrow the scope before deployment",
      }),
      evidence: [],
    });

    expect(title).toBe(
      "AI boosts productivity, but narrow the scope before deployment",
    );
  });

  it.each([
    {
      storyTitle: "Anthropic продлила доступ к Claude Code до 19 июля",
      storySummary:
        "Anthropic продлила бесплатный доступ к Claude Code до 19 июля для всех пользователей.",
    },
    {
      storyTitle: "AnthropicがClaude Codeの利用上限を7月19日まで延長",
      storySummary:
        "AnthropicがClaude Codeの利用上限を7月19日まで延長し、開発者向けのアクセス期間を広げました。",
    },
  ])("keeps a title in the generated summary script", (sample) => {
    const title = buildTopReadTitle({
      ...sample,
      primaryEvidence: evidence({ providerKey: "x-twitter" }),
      evidence: [],
    });

    expect(title).toBe(sample.storyTitle);
  });
});

const evidence = (
  overrides: Partial<SummaryEvidenceItem>,
): SummaryEvidenceItem => ({
  feedItemId: "feed-x",
  sourceItemId: "source-x",
  sourceBindingId: "binding-x",
  providerKey: "x-twitter",
  providerName: "X/Twitter",
  canonicalUrl: "https://x.com/example/status/1",
  title: "X post by @watcher: source title",
  bodyPreview: "",
  authorHandle: "watcher",
  publishedAt: new Date("2026-07-12T12:00:00.000Z"),
  observedAt: new Date("2026-07-12T12:05:00.000Z"),
  interestId: "ai-agents",
  score: 2.57,
  whyImportant: [],
  providerMetricLabels: [],
  readerActionKind: "read_source",
  ...overrides,
});
