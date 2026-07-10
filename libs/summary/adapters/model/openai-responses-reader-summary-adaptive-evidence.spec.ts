import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryCoveragePlan,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { buildAdaptiveReaderSummaryEvidence } from "./openai-responses-reader-summary-adaptive-evidence";
import {
  buildOpenAiReaderSummaryInstructions,
  buildOpenAiReaderSummaryPromptPayload,
} from "./openai-responses-reader-summary-prompt";

describe("adaptive reader summary evidence", () => {
  it("keeps 120 baseline items and expands exactly 25 ranked candidates", () => {
    const selection = evidenceSelection();
    const evidence = buildAdaptiveReaderSummaryEvidence(
      selection,
      coveragePlan(),
    );

    expect(evidence).toHaveLength(120);
    expect(
      evidence.filter((item) => item.evidenceTier === "expanded_candidate"),
    ).toHaveLength(25);
    expect(
      evidence.filter((item) => item.evidenceTier === "baseline"),
    ).toHaveLength(95);
    expect(
      evidence.every(
        (item) =>
          String(item.title).length <= 600 &&
          String(item.bodyPreview).length <= 600,
      ),
    ).toBe(true);
    expect(evidence[0]?.evidenceTier).toBe("expanded_candidate");
    expect(evidence[1]?.evidenceTier).toBe("baseline");
    expect(evidence[119]?.evidenceTier).toBe("expanded_candidate");
    expect(String(evidence[1]?.title)).toHaveLength(600);
    expect(String(evidence[1]?.bodyPreview)).toHaveLength(600);
    expect(String(evidence[1]?.bodyPreview)).toContain(
      "Original source evidence 1",
    );
  });

  it("passes short social posts in full and extracts RSS source fragments", () => {
    const evidence = buildAdaptiveReaderSummaryEvidence(
      evidenceSelection(),
      coveragePlan(),
    );
    const xSource = evidence[119]?.sourceContent as Record<string, unknown>;
    const redditSource = evidence[118]?.sourceContent as Record<
      string,
      unknown
    >;
    const rssSource = evidence[117]?.sourceContent as Record<string, unknown>;

    expect(xSource).toMatchObject({
      mode: "full_social_post",
      text: socialSourceText("X/Twitter"),
    });
    expect(redditSource).toMatchObject({
      mode: "full_social_post",
      text: socialSourceText("Reddit"),
    });
    expect(rssSource.mode).toBe("rss_relevant_fragments");
    const fragments = rssSource.fragments as readonly string[];
    expect(fragments.length).toBeGreaterThanOrEqual(2);
    expect(fragments.length).toBeLessThanOrEqual(3);
    expect(Number(rssSource.includedCharacterCount)).toBeGreaterThanOrEqual(
      1_500,
    );
    expect(Number(rssSource.includedCharacterCount)).toBeLessThanOrEqual(
      2_500,
    );
    expect(fragments.join(" ").length).toBeLessThanOrEqual(2_500);
    expect(fragments.some((fragment) => fragment.includes("Sol 5 Ultra"))).toBe(
      true,
    );
    const normalizedRssSource = rssSourceText().replace(/\s+/gu, " ").trim();
    expect(
      fragments.every((fragment) => normalizedRssSource.includes(fragment)),
    ).toBe(true);
  });

  it("serializes the adaptive pack into one model prompt", () => {
    const input = modelInput(evidenceSelection());
    const payload = JSON.parse(
      buildOpenAiReaderSummaryPromptPayload(input),
    ) as { readonly evidence: readonly Record<string, unknown>[] };
    const instructions = buildOpenAiReaderSummaryInstructions(input);

    expect(payload.evidence).toHaveLength(120);
    expect(
      payload.evidence.filter(
        (item) => item.evidenceTier === "expanded_candidate",
      ),
    ).toHaveLength(25);
    expect(instructions).toContain(
      "sourceContent selected deterministically from the original source",
    );
    expect(instructions).toContain(
      "Prefer sourceContent over bodyPreview when resolving exact model variants",
    );
  });
});

const evidenceSelection = (): SummaryEvidenceSelection => {
  const selectedEvidence = Array.from({ length: 120 }, (_, index) =>
    evidenceItem(index),
  );

  return {
    rankingPolicyVersion: "story_ranking_v1",
    sourceWindow: {
      windowId: "adaptive-evidence-window",
      startedAt: new Date("2026-07-09T00:00:00.000Z"),
      endedAt: new Date("2026-07-10T00:00:00.000Z"),
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: ["cluster-0"],
    },
    clusters: [
      {
        id: "cluster-0",
        storyKey: "adaptive:lead",
        representativeFeedItemId: "feed-0",
        duplicateFeedItemIds: [],
        interestIds: ["interest-ai"],
        providerKeys: ["reddit"],
        score: 3,
        observedAtRange: {
          startedAt: new Date("2026-07-09T00:00:00.000Z"),
          endedAt: new Date("2026-07-09T01:00:00.000Z"),
        },
        whyImportant: ["Lead source"],
      },
    ],
    selectedEvidence,
  };
};

const evidenceItem = (index: number): SummaryEvidenceItem => {
  const providerKey =
    index === 117
      ? "rss"
      : index === 118
        ? "reddit"
        : index === 119
          ? "x-twitter"
          : "hacker-news";
  const sourceText =
    index === 117
      ? rssSourceText()
      : index === 118
        ? socialSourceText("Reddit")
        : index === 119
          ? socialSourceText("X/Twitter")
          : `Original source evidence ${index}. ${"Detailed context. ".repeat(80)}`;

  return {
    feedItemId: `feed-${index}`,
    sourceItemId: `source-${index}`,
    sourceBindingId: `binding-${index}`,
    interestId: "interest-ai",
    providerKey,
    canonicalUrl: `https://example.test/${index}`,
    title:
      index === 117
        ? "Sol 5 Ultra usage limit analysis"
        : `Original source title ${index} ${"qualifier ".repeat(80)}`,
    bodyPreview: `Original preview ${index}. ${"Preview evidence. ".repeat(50)}`,
    sourceText,
    publishedAt: new Date(
      `2026-07-09T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
    ),
    observedAt: new Date(
      `2026-07-09T${String(index % 24).padStart(2, "0")}:01:00.000Z`,
    ),
    score: index,
    whyImportant: ["Sol 5 Ultra usage limits and agent workflows"],
  };
};

const coveragePlan = (): ReaderSummaryCoveragePlan => ({
  lead: {
    role: "lead",
    clusterId: "cluster-0",
    score: 3,
    feedItemIds: ["feed-0"],
    providerKeys: ["reddit"],
    interestIds: ["interest-ai"],
    whyImportant: ["Lead source"],
  },
  secondary: [],
});

const socialSourceText = (provider: string): string =>
  `${provider} original post: Sol 5 Ultra used the five-hour limit in fifteen minutes during a real refactor. The author says this applies specifically to Ultra mode.`;

const rssSourceText = (): string =>
  [
    `${"General market background without a product qualifier. ".repeat(18)}`,
    `${"Deployment context for teams evaluating coding agents. ".repeat(18)}`,
    `The report says Sol 5 Ultra exhausted a five-hour usage limit in fifteen minutes during a refactor. ${"This qualifier applies to Ultra mode only. ".repeat(14)}`,
    `${"Pricing context and unrelated industry history. ".repeat(20)}`,
  ].join(" ");

const modelInput = (
  evidence: SummaryEvidenceSelection,
): ReaderSummaryModelInput => ({
  tenantId: tenantId("tenant-adaptive-evidence"),
  workspaceId: workspaceId("workspace-adaptive-evidence"),
  scope: { type: "workspace" },
  period: {
    cadence: "daily",
    startedAt: new Date("2026-07-09T00:00:00.000Z"),
    endedAt: new Date("2026-07-10T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "daily:adaptive-evidence",
  },
  evidence,
  contextArtifacts: [],
  policy: {
    language: "auto",
    format: "executive_brief",
    tone: "analytical",
    maxStories: 8,
    includeRisks: true,
    includeInterestHighlights: true,
    includeRepeatedSignals: true,
    dedupeStrategy: "canonical_url_then_title",
    rulesVersion: "adaptive-evidence.v1",
  },
  requestedAt: new Date("2026-07-10T06:00:00.000Z"),
});
