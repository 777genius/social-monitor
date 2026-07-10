import { STORY_RANKING_POLICY_V1 } from "../policies/story-ranking-policy";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import {
  extractReaderSummaryTopicLabelCandidates,
  readerSummaryTopicLabelEvidenceTexts,
  selectReaderSummaryTopicLabel,
} from "./reader-summary-topic-label-candidates";
import { storyTopicTokens } from "./story-topic-tokenizer";

describe("story topic tokenizer", () => {
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

  it("offers the benchmark name with its primary model identity", () => {
    const evidence = evidenceItem(
      "On Agents Last Exam, GPT-5.6 Sol sets a new high, eclipsing Claude Fable 5",
    );
    const candidates = extractReaderSummaryTopicLabelCandidates({
      evidence: [evidence],
      fallbackKeywords: storyTopicTokens(evidence, STORY_RANKING_POLICY_V1),
    });

    expect(candidates.map((candidate) => candidate.label)).toContain(
      "GPT 5.6 Agents Last Exam",
    );
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
