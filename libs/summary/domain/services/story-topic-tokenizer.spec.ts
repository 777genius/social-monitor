import { STORY_RANKING_POLICY_V1 } from "../policies/story-ranking-policy";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  extractReaderSummaryTopicLabelCandidates,
  readerSummaryTopicLabelEvidenceTexts,
} from "./reader-summary-topic-label-candidates";
import { selectReaderSummaryTopicLabel } from "./reader-summary-topic-label-selection";
import {
  storyClaimFacetTokens,
  storyIdentityAnchorTokens,
  storyIdentityTokens,
  storyPrimaryClaimFacet,
  storyTopicAnchorTokens,
  storyTopicTokens,
} from "./story-topic-tokenizer";

describe("story topic tokenizer", () => {
  it("keeps a separate bounded identity window and normalizes edge punctuation", () => {
    const evidence = evidenceItem(
      "One two three four five six seven eight nine ten eleven twelve Kimi K3 security flaw.",
      "Researchers confirm the prompt-injection flaw.",
    );
    const semanticTokens = storyTopicTokens(evidence, STORY_RANKING_POLICY_V1);
    const identityTokens = storyIdentityTokens(
      evidence,
      STORY_RANKING_POLICY_V1,
    );

    expect(semanticTokens).toHaveLength(
      STORY_RANKING_POLICY_V1.semanticTopicMaxTokens,
    );
    expect(identityTokens.length).toBeLessThanOrEqual(
      STORY_RANKING_POLICY_V1.storyIdentityMaxTokens,
    );
    expect(identityTokens).toEqual(
      expect.arrayContaining(["kimi-k3", "security", "flaw"]),
    );
    expect(identityTokens).not.toContain("flaw.");
  });

  it("keeps v9 semantic tokens unchanged while identity tokens normalize Kimi", () => {
    const evidence = evidenceItem("Kimi K3 security flaw.", "");

    expect(storyTopicTokens(evidence, STORY_RANKING_POLICY_V1)).toEqual([
      "kimi",
      "security",
      "flaw.",
    ]);
    expect(storyIdentityTokens(evidence, STORY_RANKING_POLICY_V1)).toEqual([
      "kimi-k3",
      "security",
      "flaw",
    ]);
  });

  it("does not leak NFKC identity aliases into semantic topic tokens", () => {
    const evidence = evidenceItem("Ｋｉｍｉ－Ｋ３ security flaw.", "");
    const semanticTokens = storyTopicTokens(evidence, STORY_RANKING_POLICY_V1);

    expect(semanticTokens).not.toContain("kimi-k3");
    expect(storyIdentityTokens(evidence, STORY_RANKING_POLICY_V1)).toContain(
      "kimi-k3",
    );
  });

  it("keeps Kimi identity anchors out of v9 semantic classification", () => {
    const evidence = evidenceItem("Kimi-K3 security prompt injection", "");
    const semanticTokens = storyTopicTokens(evidence, STORY_RANKING_POLICY_V1);
    const identityTokens = storyIdentityTokens(
      evidence,
      STORY_RANKING_POLICY_V1,
    );

    expect(semanticTokens).toContain("kimi-k3");
    expect(storyTopicAnchorTokens(semanticTokens)).not.toContain("kimi-k3");
    expect(storyIdentityAnchorTokens(identityTokens)).toContain("kimi-k3");
  });

  it("extracts a concrete versioned model candidate from opinion headlines", () => {
    const evidence = evidenceItem(
      "X post: I didn't expect this, but Grok 4.5 deserves a serious run",
    );
    const keywords = storyTopicTokens(evidence, STORY_RANKING_POLICY_V1);
    const candidates = extractReaderSummaryTopicLabelCandidates({
      evidence: [evidence],
      fallbackKeywords: keywords,
    });

    expect(keywords).toEqual(expect.arrayContaining(["grok", "grok-4.5"]));
    expect(candidates.map((candidate) => candidate.label)).toContain(
      "Grok 4.5",
    );
  });

  it("prioritizes the title entity over tools mentioned later in the body", () => {
    const evidence = evidenceItem(
      "Grok 4.5 made me give Grok Build a serious run today",
      "The author later compares it with Claude Code, Codex, and OpenCode.",
    );
    const candidates = extractReaderSummaryTopicLabelCandidates({
      evidence: [evidence],
      fallbackKeywords: storyTopicTokens(evidence, STORY_RANKING_POLICY_V1),
    });

    expect(candidates[0]?.label).toBe("Grok 4.5");
    expect(
      candidates.slice(0, 3).map((candidate) => candidate.label),
    ).not.toEqual(
      expect.arrayContaining(["Claude Code Grok 4.5", "Codex Grok 4.5"]),
    );
  });

  it("keeps the primary model identity when a benchmark name is too long", () => {
    const evidence = evidenceItem(
      "On Agents Last Exam, GPT-5.6 Sol sets a new high, eclipsing Claude Fable 5",
    );
    const candidates = extractReaderSummaryTopicLabelCandidates({
      evidence: [evidence],
      fallbackKeywords: storyTopicTokens(evidence, STORY_RANKING_POLICY_V1),
    });

    expect(candidates.map((candidate) => candidate.label)).toContain("GPT 5.6");
    expect(
      candidates.every(
        (candidate) =>
          candidate.label.split(/\s+/u).filter(Boolean).length <= 4,
      ),
    ).toBe(true);
  });

  it("does not treat a source author handle as topic evidence", () => {
    const evidence = evidenceItem(
      "X post by @kunchenguid: Grok 4.5 made me give Grok Build a serious run",
      "The review compares coding harnesses without naming the author.",
    );
    const keywords = storyTopicTokens(evidence, STORY_RANKING_POLICY_V1);
    const candidates = extractReaderSummaryTopicLabelCandidates({
      evidence: [evidence],
      fallbackKeywords: keywords,
    });

    expect(keywords).not.toContain("kunchenguid");
    expect(
      candidates.every(
        (candidate) =>
          !candidate.label.toLocaleLowerCase("en-US").includes("kunchenguid"),
      ),
    ).toBe(true);
    expect(
      selectReaderSummaryTopicLabel({
        proposedLabel: "Grok 4.5 Kunchenguid",
        labelCandidates: candidates,
        evidenceTexts: readerSummaryTopicLabelEvidenceTexts({
          evidence: [evidence],
          fallbackKeywords: keywords,
        }),
        providerLabels: ["X/Twitter"],
      }),
    ).toBe("Grok 4.5 Review");
  });

  it("removes promotional filler from concrete project candidates", () => {
    const evidence = evidenceItem(
      "Introducing OpenKnowledge, the best markdown IDE for humans and agents",
    );
    const candidates = extractReaderSummaryTopicLabelCandidates({
      evidence: [evidence],
      fallbackKeywords: storyTopicTokens(evidence, STORY_RANKING_POLICY_V1),
    });

    expect(candidates.map((candidate) => candidate.label)).toContain(
      "OpenKnowledge Markdown IDE",
    );
    expect(candidates.map((candidate) => candidate.label)).not.toContain(
      "OpenKnowledge Best Markdown",
    );
  });

  it("normalizes xAI and SpaceXAI into one ecosystem anchor", () => {
    const evidence = evidenceItem(
      "SpaceXAI releases Grok 4.5 alongside xAI tooling",
    );

    expect(storyTopicTokens(evidence, STORY_RANKING_POLICY_V1)).toEqual(
      expect.arrayContaining(["xai", "grok", "grok-4.5"]),
    );
  });

  it.each([
    ["OpenAI starts the GPT-5.6 family rollout", "release"],
    ["GPT-5.6 Sol leads the Artificial Analysis benchmark", "benchmark"],
    ["GPT-5.6 is 54% more token efficient", "efficiency"],
    ["GPT-5.6 appears in Codex for Plus accounts", "availability"],
    ["Claude Code outage", "availability"],
    ["Claude Code unavailable", "availability"],
    ["GPT-5.6 Sol masterclass for business workflows", "education"],
    ["ChatGPT vs. Codex in a side-by-side test", "comparison"],
    ["Grok 4.5 honest first impression", "review"],
  ] as const)("classifies %s as a %s claim", (title, expected) => {
    expect(storyPrimaryClaimFacet(evidenceItem(title))).toBe(expected);
  });

  it("separates operational unavailability from ordinary product access", () => {
    expect(storyClaimFacetTokens(evidenceItem("Claude Code outage"))).toContain(
      "event:service-unavailability",
    );
    expect(
      storyClaimFacetTokens(evidenceItem("Claude Code unavailable")),
    ).toContain("event:service-unavailability");
    expect(
      storyClaimFacetTokens(evidenceItem("Claude Code available in Plus")),
    ).not.toContain("event:service-unavailability");
  });

  it("recognizes a shared evaluation brief as a comparison", () => {
    expect(
      storyPrimaryClaimFacet(
        evidenceItem(
          "I gave GPT-5.4, GPT-5.5, GPT-5.6 Sol, Terra and Luna the same 35-word Coca-Cola Zero brief",
          "The models received the prompt at the highest available setting.",
        ),
      ),
    ).toBe("comparison");
  });

  it("recognizes period-delimited versus shorthand as a comparison", () => {
    expect(
      storyPrimaryClaimFacet(
        evidenceItem(
          "I am confused by ChatGPT v. ChatGPT Codex v. ChatGPT Work v. Claude",
          "The post compares the current product lineup.",
        ),
      ),
    ).toBe("comparison");
  });

  it("does not confuse an available reasoning setting with product availability", () => {
    expect(
      storyPrimaryClaimFacet(
        evidenceItem(
          "GPT-5.6 completed the frontend task",
          "Reasoning was set to the highest available setting.",
        ),
      ),
    ).toBeUndefined();
  });

  it.each([
    [
      "Biggest scam humanity accepted as normal according to ChatGPT",
      "ChatGPT Scam",
    ],
    [
      "We are hiring scientists to come work with our team at Anthropic",
      "Anthropic Scientists",
    ],
  ])("builds an entity-first noun phrase for %s", (title, expected) => {
    const evidence = evidenceItem(title);
    const candidates = extractReaderSummaryTopicLabelCandidates({
      evidence: [evidence],
      fallbackKeywords: storyTopicTokens(evidence, STORY_RANKING_POLICY_V1),
    });

    expect(candidates.map((candidate) => candidate.label)).toContain(expected);
  });
});

const evidenceItem = (
  title: string,
  bodyPreview = "Hands-on impressions of the versioned model.",
): SummaryEvidenceItem => ({
  feedItemId: "feed-grok",
  sourceItemId: "source-grok",
  sourceBindingId: "binding-grok",
  interestId: "ai",
  providerKey: "x-twitter",
  canonicalUrl: "https://example.test/grok",
  title,
  bodyPreview,
  publishedAt: new Date("2026-07-09T10:00:00.000Z"),
  observedAt: new Date("2026-07-09T10:01:00.000Z"),
  score: 1,
  whyImportant: ["Versioned model evaluation"],
});
