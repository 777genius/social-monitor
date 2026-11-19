import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  READER_PROMOTION_POLICY_STAMP,
  buildReaderSummaryCoveragePlan,
  type ReaderSummaryCoveragePlan,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { availablePromotionV3PresentationIds } from "./openai-responses-reader-summary-v3-presentation-candidates";
import { buildAdaptiveReaderSummaryEvidence } from "./openai-responses-reader-summary-adaptive-evidence";
import { expandedEvidenceIds, sourceHydrationLimitForSelection } from "./openai-responses-reader-summary-expansion-policy";
import { selectHydratableExpandedEvidenceIds } from "./openai-responses-reader-summary-expanded-candidate-selection";
import {
  acceptedReaderPresentation,
  compactConversationContext,
  projectReaderSummaryPromptEvidenceItem,
} from "./openai-responses-reader-summary-evidence-projection";
import { acceptedReaderPresentation as directAcceptedReaderPresentation } from "./openai-responses-reader-summary-verified-presentation";
import { compactConversationContext as directCompactConversationContext } from "./openai-responses-reader-summary-conversation-context";
import {
  buildOpenAiReaderSummaryInstructions,
  buildOpenAiReaderSummaryPromptPayload,
} from "./openai-responses-reader-summary-prompt";

describe("adaptive reader summary evidence", () => {
  it("projects bounded quality diagnostics without exposing internal admission decisions or mutating input", () => {
    const quality = Object.freeze({
      decision: "accepted",
      reason: "r".repeat(180),
      flags: Object.freeze(["first", "second", "third", "fourth", "fifth", "sixth", "seventh"]),
      eligibleForTopRead: true,
      eligibleForSummary: false,
      needsLlmReview: true,
      qualityScore: 0.91,
      interestRelevanceScore: 0.81,
      engagementIntegrityScore: 0.71,
    });
    const item = { ...evidenceItem(0), contentQuality: quality };
    const before = JSON.stringify(item);
    const projected = projectReaderSummaryPromptEvidenceItem(item, 0, false, "c1", 50_000, false);
    expect(projected.contentQuality).toEqual({
      decision: "accepted",
      reason: `${"r".repeat(137)}...`,
      flags: ["first", "second", "third", "fourth", "fifth", "sixth"],
      eligibleForTopRead: true,
      qualityScore: 0.91,
      interestRelevanceScore: 0.81,
      engagementIntegrityScore: 0.71,
    });
    expect(projected.contentQuality).not.toHaveProperty("eligibleForSummary");
    expect(projected.contentQuality).not.toHaveProperty("needsLlmReview");
    expect(JSON.stringify(item)).toBe(before);
    expect(projectReaderSummaryPromptEvidenceItem({
      ...item, contentQuality: undefined,
    }, 0, false, "c1", 50_000, false).contentQuality).toBeUndefined();
  });


  it("selects only available V3 presentation IDs from admitted lanes without mutating promotion state", () => {
    const candidate = (candidateId: string, status: string) => ({
      candidateId,
      presentation: { status },
    } as never);
    const selection: SummaryEvidenceSelection = {
      ...evidenceSelection(),
      promotionV3: {
        policyVersion: READER_PROMOTION_POLICY_STAMP,
        outcome: "ready",
        top: [candidate("feed-0", "available"), candidate("feed-1", "unavailable")],
        additional: [candidate("feed-2", "available"), candidate("feed-0", "available")],
        news: [candidate("feed-119", "available"), candidate("feed-3", "rejected")],
        excluded: [candidate("feed-4", "available")],
      },
    };
    const frozen = JSON.stringify(selection.promotionV3);

    expect([...availablePromotionV3PresentationIds(selection)]).toEqual([
      "feed-0", "feed-2", "feed-119",
    ]);
    expect(availablePromotionV3PresentationIds({
      ...selection, promotionV3: undefined,
    }).size).toBe(0);
    expect(JSON.stringify(selection.promotionV3)).toBe(frozen);
  });

  it("keeps coverage-first admission, 25-cap, and source-only rejection in the independent candidate policy", () => {
    const initial = evidenceSelection();
    const selection: SummaryEvidenceSelection = {
      ...initial,
      selectedEvidence: initial.selectedEvidence.map((item) =>
        item.feedItemId === "feed-0" || item.feedItemId === "feed-119"
          ? { ...item, sourceText: "https://source.test/only",
              bodyPreview: "https://source.test/only" }
          : item,
      ),
    };
    const frozen = JSON.stringify(selection);
    const plan = coveragePlan();
    const admitted = [...selectHydratableExpandedEvidenceIds(
      selection, plan, sourceHydrationLimitForSelection(selection),
    )];

    expect(admitted).toHaveLength(25);
    expect(new Set(admitted).size).toBe(25);
    expect(admitted[0]).toBe("feed-118");
    expect(admitted).not.toContain("feed-0");
    expect(admitted).not.toContain("feed-119");
    expect([...expandedEvidenceIds(selection, plan)]).toEqual(admitted);
    expect(JSON.stringify(selection)).toBe(frozen);
  });

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
    expect(Number(rssSource.includedCharacterCount)).toBeLessThanOrEqual(2_500);
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
    expect(payload.evidence[0]?.providerMetrics).toEqual([
      { label: "Points", value: "30" },
      { label: "Comments", value: "10" },
    ]);
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

  it("serializes a verified qualification after 60k for the final V3 writer", () => {
    const qualification = "only in Ultra preview mode";
    const body = `${"a".repeat(60_500)} ${qualification}`;
    const start = body.indexOf(qualification);
    const base = evidenceItem(0);
    const item: SummaryEvidenceItem = { ...base, feedItemId: "feed-late",
      sourceText: body, bodyPreview: body, readerHeadline: {
        status: "accepted", kind: "claim", text: "The limit changed in preview",
        binding: { candidateId: "feed-late", providerKey: base.providerKey,
          tenantId: "tenant", workspaceId: "workspace", interestId: base.interestId,
          sourceBindingId: base.sourceBindingId, sourceItemId: base.sourceItemId,
          trustedIntent: "intent", availability: "body_present",
          reviewedInputDigest: "a".repeat(64) },
        support: [{ field: "bodyPreview", start: 60_500, end: 60_501,
          quote: " " }],
        qualifications: [{ phrase: qualification, evidence: [{
          field: "bodyPreview", start, end: start + qualification.length,
          quote: qualification,
        }] }], confidence: 0.95,
        wholeInput: { titleLength: base.title.length, bodyLength: body.length,
          qualificationJudgment: "preserved" },
      } };
    const selection: SummaryEvidenceSelection = {
      ...evidenceSelection(), selectedEvidence: [item],
      sourceWindow: { ...evidenceSelection().sourceWindow,
        selectedFeedItemIds: [item.feedItemId] },
      promotionV3: { policyVersion: READER_PROMOTION_POLICY_STAMP, outcome: "ready",
        top: [{ candidateId: item.feedItemId,
          presentation: { status: "available", presentationInputDigest: "b".repeat(64) } } as never],
        additional: [], news: [], excluded: [] },
    };
    const plan: ReaderSummaryCoveragePlan = { ...coveragePlan(),
      lead: { ...coveragePlan().lead!, feedItemIds: [item.feedItemId] } };
    const evidence = buildAdaptiveReaderSummaryEvidence(selection, plan);
    const accepted = evidence[0]?.acceptedReaderPresentation as {
      readonly headline: string;
      readonly qualifications: readonly { readonly phrase: string;
        readonly evidence: readonly { readonly quote: string }[] }[];
      readonly reviewedBodyLength: number;
    };

    expect(accepted.headline).toBe("The limit changed in preview");
    expect(accepted.qualifications[0]?.phrase).toBe(qualification);
    expect(accepted.qualifications[0]?.evidence[0]?.quote).toBe(qualification);
    expect(accepted.reviewedBodyLength).toBeGreaterThan(60_000);
    expect(acceptedReaderPresentation(item)).toMatchObject({ headline: accepted.headline });
    expect(acceptedReaderPresentation({ ...item, feedItemId: "unrelated-feed" })).toBeUndefined();
    const input = modelInput(selection);
    Object.assign(input, { coveragePlan: plan });
    const payload = buildOpenAiReaderSummaryPromptPayload(input);
    expect(payload).toContain(qualification);
    expect(buildOpenAiReaderSummaryInstructions(input)).toContain(
      "never restate its claim without those qualifications",
    );
  });
  it("reserves expanded candidate slots for grounded coverage before score ranking", () => {
    const selection = evidenceSelection();
    const plan: ReaderSummaryCoveragePlan = {
      ...coveragePlan(),
      lead: { ...coveragePlan().lead!, feedItemIds: ["feed-0", "feed-1"] },
    };
    const projected = buildAdaptiveReaderSummaryEvidence(selection, plan);

    expect(projected[0]?.evidenceTier).toBe("expanded_candidate");
    expect(projected[1]?.evidenceTier).toBe("expanded_candidate");
    expect(projected.filter((item) => item.evidenceTier === "expanded_candidate")).toHaveLength(25);
    expect(projected[1]?.citationId).toBe("c2");
  });

  it("does not expand coverage evidence whose source becomes empty after URL redaction", () => {
    const selection: SummaryEvidenceSelection = {
      ...evidenceSelection(),
      selectedEvidence: [
        { ...evidenceItem(0), sourceText: "https://example.test/only", bodyPreview: " " },
        evidenceItem(1),
      ],
    };
    const projected = buildAdaptiveReaderSummaryEvidence(selection, coveragePlan());

    expect(projected[0]?.evidenceTier).toBe("baseline");
    expect(projected[0]?.sourceContent).toBeUndefined();
    expect(projected[1]?.evidenceTier).toBe("expanded_candidate");
  });

  it("uses the same source-length policy for expansion admission and transmitted hydration", () => {
    const seed = evidenceSelection();
    const sourceText = "🧪界".repeat(20_000); // 60,000 UTF-16 code units.
    const source = Object.freeze({
      ...evidenceItem(0), sourceText, bodyPreview: "Short independent preview",
    });
    const legacy: SummaryEvidenceSelection = {
      ...seed, selectedEvidence: [source],
    };
    const promotionV3: SummaryEvidenceSelection = {
      ...legacy,
      promotionV3: {
        policyVersion: READER_PROMOTION_POLICY_STAMP,
        outcome: "ready",
        top: [], additional: [], news: [], excluded: [],
      },
    };
    const legacyResult = buildAdaptiveReaderSummaryEvidence(legacy, coveragePlan());
    const v3Result = buildAdaptiveReaderSummaryEvidence(promotionV3, coveragePlan());
    const legacyContent = legacyResult[0]?.sourceContent as {
      readonly originalCharacterCount: number;
    };
    const v3Content = v3Result[0]?.sourceContent as {
      readonly originalCharacterCount: number;
    };

    expect(sourceHydrationLimitForSelection(legacy)).toBe(50_000);
    expect(sourceHydrationLimitForSelection(promotionV3)).toBe(64_000);
    expect(legacyResult[0]?.evidenceTier).toBe("expanded_candidate");
    expect(v3Result[0]?.evidenceTier).toBe("expanded_candidate");
    expect(legacyContent.originalCharacterCount).toBe(50_000);
    expect(v3Content.originalCharacterCount).toBe(sourceText.length);
    expect(source.sourceText).toBe(sourceText);
  });

  it("retains model-visible preview when only a truncated Unicode prefix was transmitted", () => {
    const sourceText = "🧪界".repeat(240) + " qualifier";
    const item = Object.freeze({ ...evidenceItem(0), sourceText });
    const projected = projectReaderSummaryPromptEvidenceItem(
      item, 0, true, "c1", 320, false,
    );
    const hydrated = projected.sourceContent as {
      readonly mode: string; readonly originalCharacterCount: number;
      readonly text: string;
    };

    expect(hydrated.mode).toBe("full_source_text");
    expect(hydrated.originalCharacterCount).toBe(320);
    expect(hydrated.text).toHaveLength(320);
    expect(sourceText).toContain(hydrated.text);
    expect(String(projected.bodyPreview).length).toBeGreaterThan(320);
    expect(String(projected.bodyPreview).length).toBeLessThanOrEqual(600);
    expect(hydrated.text).not.toContain(String(projected.bodyPreview));
    expect(item.sourceText).toBe(sourceText);
  });

  it("omits only previews covered by the exact hydrated full source, including UTF-16", () => {
    const sourceText = "Ultra 🧪界 preview with a precise model qualifier";
    const item: SummaryEvidenceItem = {
      ...evidenceItem(0), sourceText, bodyPreview: "different source preview",
    };
    const before = JSON.stringify(item);
    const projected = projectReaderSummaryPromptEvidenceItem(item, 0, true, "c1", 50_000, false);
    expect(projected.sourceContent).toMatchObject({
      mode: "full_source_text", text: sourceText,
    });
    expect(projected.bodyPreview).toBeUndefined();
    // Non-expanded evidence cannot assume the source was already included.
    const baseline = projectReaderSummaryPromptEvidenceItem(item, 0, false, "c1", 50_000, false);
    expect(baseline.sourceContent).toBeUndefined();
    expect(baseline.bodyPreview).toBe(sourceText);
    expect(JSON.stringify(item)).toBe(before);
  });

  it("retains an abbreviated preview when it is not contained in selected fragments", () => {
    const item: SummaryEvidenceItem = {
      ...evidenceItem(0),
      sourceText: "🧪".repeat(1_310),
    };
    const projected = projectReaderSummaryPromptEvidenceItem(item, 0, true, "c1", 5_000, false);
    const hydrated = projected.sourceContent as { readonly fragments: readonly string[] };
    expect(hydrated.fragments.length).toBeGreaterThan(0);
    expect(projected.bodyPreview).toBeDefined();
    expect(String(projected.bodyPreview).length).toBeLessThanOrEqual(600);
    expect(hydrated.fragments.some((fragment) =>
      fragment.includes(String(projected.bodyPreview)))).toBe(false);
  });

  it("omits a preview also present verbatim in one relevance fragment", () => {
    const prefix = "Ultra ".repeat(99) + "abc";
    expect(prefix).toHaveLength(597);
    const sourceText = prefix + "... " + "Noise ".repeat(460);
    const item: SummaryEvidenceItem = {
      ...evidenceItem(0),
      title: "Ultra model evidence",
      whyImportant: ["Ultra model signal"],
      sourceText,
    };
    const projected = projectReaderSummaryPromptEvidenceItem(item, 0, true, "c1", 5_000, false);
    const hydrated = projected.sourceContent as { readonly fragments: readonly string[] };
    expect(hydrated.fragments.length).toBeGreaterThan(0);
    expect(hydrated.fragments.some((fragment) => fragment.includes(prefix + "..."))).toBe(true);
    expect(projected.bodyPreview).toBeUndefined();
  });

  it("keeps single-item prompt projection equivalent to the composed pack", () => {
    const selection = evidenceSelection();
    const projected = buildAdaptiveReaderSummaryEvidence(selection, coveragePlan());
    expect(projected[0]).toEqual(projectReaderSummaryPromptEvidenceItem(
      selection.selectedEvidence[0]!, 0, true, "c1", 50_000, false,
    ));
    expect(sourceHydrationLimitForSelection(selection)).toBe(50_000);
  });

  it("keeps verified presentation as a dedicated fail-closed trust boundary", () => {
    const item = evidenceItem(3);
    expect(acceptedReaderPresentation).toBe(directAcceptedReaderPresentation);
    expect(acceptedReaderPresentation(item)).toBeUndefined();
    expect(projectReaderSummaryPromptEvidenceItem(
      item, 3, true, "c4", 500, true,
    ).acceptedReaderPresentation).toBeUndefined();
  });

  it("keeps conversation projection bounded and its historic export identical", () => {
    const unit = {
      conversationUnitId: "comment-1",
      providerUnitId: "provider-comment-1",
      threadExternalId: "thread-1",
      canonicalUrl: "https://example.invalid/comment",
      body: "word ".repeat(95),
      score: 4,
      replyCount: 2,
      signalBand: "high",
      depth: 0,
      role: "top_level_comment" as const,
      selectionReason: "ranked" as const,
      publishedAt: "2026-07-09T00:00:00.000Z",
    };
    const ancestor = {
      ...unit,
      role: "reply" as const,
      selectionReason: "ancestor_context" as const,
      body: "ancestor ".repeat(80),
    };
    const context = {
      rankingBasis: "cohort_baseline_v1" as const,
      bundleScore: 15,
      units: Array.from({ length: 7 }, (_, index) => ({
        ...unit,
        providerUnitId: `provider-comment-${index}`,
        ancestry: [ancestor, ancestor, ancestor],
      })),
    };

    expect(compactConversationContext).toBe(directCompactConversationContext);
    const projected = compactConversationContext(context);
    expect(projected.rankingBasis).toBe("cohort_baseline_v1");
    expect(projected.bundleScore).toBe(15);
    expect(projected.units).toHaveLength(5);
    expect(projected.units[0]?.body.length).toBeLessThanOrEqual(320);
    expect(projected.units[0]?.ancestry).toHaveLength(2);
    expect(projected.units[0]?.ancestry?.[0]?.body.length).toBeLessThanOrEqual(220);
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
    providerMetricLabels:
      index === 0
        ? [
            { label: "Points", value: "30" },
            { label: "Comments", value: "10" },
          ]
        : undefined,
  };
};

const coveragePlan = (): ReaderSummaryCoveragePlan => ({
  mode: "single_story",
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
  coveragePlan: buildReaderSummaryCoveragePlan(evidence),
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
