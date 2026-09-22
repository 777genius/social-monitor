import type { ReaderValueAnswers, ReaderValueCriterion } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";

import {
  compareReaderPostPromotionV3,
  selectReaderPostPromotionsV3,
  type ReaderPostPromotionV3Candidate,
} from "./reader-post-promotion-v3";

describe("Reader promotion V3", () => {
  it("admits provider choice without popularity, old quality floors, or context gates", () => {
    const useful = candidate(1, { usefulness: "useful", relevance: "central",
      providerFamily: "rss", presentation: "available" });
    const popularNoise = candidate(2, { usefulness: "noise", relevance: "central",
      providerFamily: "x", presentation: "available" });
    const diagnosticOnly = candidate(3, { usefulness: "useful", relevance: "relevant",
      providerFamily: "reddit", presentation: "available", context: "insufficient",
      evidence: "linked_claim" });
    const result = selectReaderPostPromotionsV3([popularNoise, diagnosticOnly, useful]);
    expect(result.top.map((item) => item.candidateId)).toEqual([
      useful.candidateId, diagnosticOnly.candidateId,
    ]);
    expect(result.excluded).toContainEqual({ candidateId: popularNoise.candidateId,
      reason: "semantic_not_admitted" });
  });

  it.each([
    ["insufficient_context", "central"],
    ["useful", "adjacent"],
  ] as const)("keeps %s/%s out of Top", (usefulness, relevance) => {
    expect(selectReaderPostPromotionsV3([
      candidate(1, { usefulness, relevance, presentation: "available" }),
    ]).outcome).toBe("no_signal");
  });

  it("uses authoritative choice through argmax mismatch and ties", () => {
    const mismatch = candidate(1, { usefulness: "useful", relevance: "relevant",
      presentation: "available", mismatch: true });
    const tie = candidate(2, { usefulness: "useful", relevance: "relevant",
      presentation: "available", tie: true });
    expect(selectReaderPostPromotionsV3([tie, mismatch]).top).toHaveLength(2);
  });

  it("uses the exact deterministic comparator and bytewise candidate id tie break", () => {
    const candidates = [
      candidate(3, { usefulness: "useful", relevance: "central", publishedAt: "2026-09-20T00:00:00.000001Z" }),
      candidate(2, { usefulness: "important", relevance: "relevant", publishedAt: "2026-09-19T00:00:00.000001Z" }),
      candidate(1, { usefulness: "important", relevance: "central", publishedAt: "2026-09-18T00:00:00.000001Z" }),
      candidate(4, { usefulness: "important", relevance: "central", publishedAt: "2026-09-20T00:00:00.000002Z" }),
    ];
    expect([...candidates].sort(compareReaderPostPromotionV3).map((item) => item.candidateId))
      .toEqual([candidates[3]!.candidateId, candidates[2]!.candidateId,
        candidates[1]!.candidateId, candidates[0]!.candidateId]);
  });

  it("falls back within a story and preserves one global order across presentation delays", () => {
    const unavailableLead = candidate(1, { storyId: "story-a", usefulness: "important",
      relevance: "central", presentation: "unavailable" });
    const fallback = candidate(2, { storyId: "story-a", usefulness: "useful",
      relevance: "central", presentation: "available" });
    const other = candidate(3, { storyId: "story-b", usefulness: "useful",
      relevance: "relevant", presentation: "available" });
    const selected = selectReaderPostPromotionsV3([other, fallback, unavailableLead]);
    expect(selected.top.map((item) => item.candidateId)).toEqual([
      fallback.candidateId, other.candidateId,
    ]);
  });

  it("selects one stable representative for feed items sharing a source assessment", () => {
    const sharedSourceItem = "00000000-0000-4000-8000-000000009999";
    const lower = candidate(2, { sourceItemId: sharedSourceItem,
      storyId: "story-second", usefulness: "useful", relevance: "central",
      presentation: "available" });
    const representative = candidate(1, { sourceItemId: sharedSourceItem,
      storyId: "story-first", usefulness: "important", relevance: "central",
      presentation: "available" });

    const selected = selectReaderPostPromotionsV3([lower, representative]);

    expect(selected.top.map((item) => item.candidateId))
      .toEqual([representative.candidateId]);
    expect(selected.excluded).toContainEqual({ candidateId: lower.candidateId,
      reason: "story_representative" });
  });

  it.each([[1, 8], [2, 6], [3, 4]])(
    "applies the existing %i-provider cap of %i once", (providerCount, cap) => {
      const providers = ["x", "reddit", "rss"] as const;
      const candidates = Array.from({ length: 20 }, (_, index) => candidate(index + 1, {
        providerFamily: providers[index % providerCount]!, presentation: "available",
        storyId: `story-${index}`,
      }));
      const selected = selectReaderPostPromotionsV3(candidates);
      const counts = new Map<string, number>();
      selected.top.forEach((item) => counts.set(item.providerFamily,
        (counts.get(item.providerFamily) ?? 0) + 1));
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(cap);
      expect(selected.top.length).toBeLessThanOrEqual(8);
      expect(selected.additional.length).toBe(8);
    });

  it("distinguishes no signal, presentation unavailable, and budget exhaustion", () => {
    expect(selectReaderPostPromotionsV3([
      candidate(1, { usefulness: "noise", presentation: "available" }),
    ]).outcome).toBe("no_signal");
    expect(selectReaderPostPromotionsV3([
      candidate(2, { presentation: "unavailable" }),
    ]).outcome).toBe("presentation_unavailable");
    expect(selectReaderPostPromotionsV3([
      candidate(3, { presentation: "budget_exhausted" }),
    ]).outcome).toBe("budget_exhausted");
  });
});

type ChoiceOverrides = {
  usefulness?: ReaderValueAnswers["usefulness"]["choice"];
  relevance?: ReaderValueAnswers["relevance"]["choice"];
  context?: ReaderValueAnswers["context_sufficiency"]["choice"];
  evidence?: ReaderValueAnswers["evidence_basis"]["choice"];
  providerFamily?: ReaderPostPromotionV3Candidate["providerFamily"];
  sourceItemId?: string;
  presentation?: ReaderPostPromotionV3Candidate["presentation"]["status"];
  publishedAt?: string;
  storyId?: string;
  mismatch?: boolean;
  tie?: boolean;
};

const candidate = (ordinal: number, overrides: ChoiceOverrides = {}):
ReaderPostPromotionV3Candidate => ({
  candidateId: `00000000-0000-4000-8000-${ordinal.toString().padStart(12, "0")}`,
  providerKey: overrides.providerFamily === "x" ? "x-twitter" :
    overrides.providerFamily === "hacker_news" ? "hacker-news" :
      overrides.providerFamily === "github_radar" ? "github-repo-radar" :
        overrides.providerFamily ?? "x-twitter",
  providerFamily: overrides.providerFamily ?? "x",
  sourceItemId: overrides.sourceItemId ?? `source-${ordinal}`,
  canonicalIdentity: `identity-${ordinal}`,
  storyId: overrides.storyId ?? `story-${ordinal}`,
  publishedAt: overrides.publishedAt ?? "2026-09-20T00:00:00.000001Z",
  assessmentId: `assessment-${ordinal}`,
  assessedAt: "2026-09-20T00:00:01.000001Z",
  rubricVersion: "reader-value.v1",
  sourceSnapshotSha256: "a".repeat(64), inputSha256: "b".repeat(64),
  rubricSha256: "c".repeat(64), modelConfigVersion: "jev-config.v1",
  answers: answers(overrides),
  presentation: overrides.presentation === "available" || overrides.presentation === undefined
    ? { status: "available", presentationInputDigest: "d".repeat(64) }
    : overrides.presentation === "unavailable"
      ? { status: "unavailable", reason: "insufficient_support" }
      : { status: overrides.presentation },
  scopeValid: true, sourceIdentityValid: true, freshnessValid: true,
  safetyValid: true, citationValid: true, blocked: false,
});

const answers = (overrides: ChoiceOverrides): ReaderValueAnswers => ({
  usefulness: answer("usefulness", overrides.usefulness ?? "useful", overrides),
  relevance: answer("relevance", overrides.relevance ?? "relevant", overrides),
  context_sufficiency: answer("context_sufficiency", overrides.context ?? "sufficient", overrides),
  evidence_basis: answer("evidence_basis", overrides.evidence ?? "observation", overrides),
});

const labels = {
  usefulness: ["noise", "context", "useful", "important", "insufficient_context"],
  relevance: ["unrelated", "adjacent", "relevant", "central", "insufficient_context"],
  context_sufficiency: ["insufficient", "partial", "sufficient"],
  evidence_basis: ["observation", "described_data", "linked_claim", "unsupported_claim", "no_claim", "insufficient_context"],
} as const;

const answer = <K extends ReaderValueCriterion>(
  criterion: K,
  choice: ReaderValueAnswers[K]["choice"],
  overrides: ChoiceOverrides,
): ReaderValueAnswers[K] => {
  const criterionLabels = labels[criterion] as readonly string[];
  const probability = 1 / criterionLabels.length;
  const probabilities = Object.fromEntries(criterionLabels.map((label) =>
    [label, overrides.tie ? probability : label === choice ? 0.6 : 0.4 / (criterionLabels.length - 1)]));
  if (overrides.mismatch) {
    probabilities[criterionLabels.find((label) => label !== choice)!] = 0.7;
    probabilities[choice as string] = 0.3 / (criterionLabels.length - 1);
  }
  return { choice, probabilities, confidence: 0.8,
    choiceDiffersFromArgmax: overrides.mismatch === true,
    probabilityTie: overrides.tie === true } as ReaderValueAnswers[K];
};
