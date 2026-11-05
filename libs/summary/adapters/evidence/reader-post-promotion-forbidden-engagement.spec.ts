import type { JsonObject } from "@social-monitor/shared-kernel";

import {
  evaluateReaderPostPromotion,
  selectReaderPostPromotions,
  type ReaderPostPromotionInput,
} from "../../domain";
import { buildReaderPromotionV2TestAttestations } from
  "../../domain/services/reader-post-promotion-attestation.spec-support";
import { normalizePromotionAttestations } from
  "../persistence/prisma/prisma-reader-summary-promotion-attestation";
import { presentPromotionAttestation } from
  "../../features/shared/reader-summary-artifact-presenter";
import { readerPostPromotionFacts } from "./reader-post-promotion-facts";

describe("forbidden secondary engagement production path", () => {
  it.each(cases())(
    "keeps $provider promotion facts and decision byte-for-byte equivalent",
    ({ provider, baseline, mutated }) => {
      const expectedFacts = facts(provider, baseline);
      const actualFacts = facts(provider, mutated);
      expect(actualFacts).toEqual(expectedFacts);
      expect(evaluateReaderPostPromotion(input(provider, actualFacts)))
        .toEqual(evaluateReaderPostPromotion(input(provider, expectedFacts)));
      const expectedSelection = selectReaderPostPromotions([
        input(provider, expectedFacts),
      ]);
      const actualSelection = selectReaderPostPromotions([
        input(provider, actualFacts),
      ]);
      expect(actualSelection).toEqual(expectedSelection);
      const expectedAttestations = buildReaderPromotionV2TestAttestations(
        expectedSelection,
        binding(),
      );
      const actualAttestations = buildReaderPromotionV2TestAttestations(
        actualSelection,
        binding(),
      );
      expect(bytes(actualAttestations)).toBe(bytes(expectedAttestations));

      const expectedPersistence = persisted(expectedAttestations);
      const actualPersistence = persisted(actualAttestations);
      expect(bytes(actualPersistence)).toBe(bytes(expectedPersistence));
      expect(bytes(actualPersistence.map(presentPromotionAttestation))).toBe(
        bytes(expectedPersistence.map(presentPromotionAttestation)),
      );
    },
  );
});

const bytes = (value: unknown): string => JSON.stringify(value);

const persisted = (
  value: ReturnType<typeof buildReaderPromotionV2TestAttestations>,
) => normalizePromotionAttestations(JSON.parse(JSON.stringify(value)));

const binding = () => ({
  artifactId: "artifact-forbidden-engagement",
  sourceWindow: {
    windowId: "window-forbidden-engagement",
    startedAt: new Date("2026-08-18T00:00:00.000Z"),
    endedAt: new Date("2026-08-19T00:00:00.000Z"),
    periodStartedAt: new Date("2026-08-18T00:00:00.000Z"),
    periodEndedAt: new Date("2026-08-19T00:00:00.000Z"),
    ingestionCutoff: new Date("2026-08-19T00:00:00.000Z"),
    selectedFeedItemIds: [],
    storyClusterIds: [],
  },
});

const facts = (providerKey: string, providerMetadata: JsonObject) =>
  readerPostPromotionFacts({
    providerKey,
    providerMetadata,
    canonicalUrl: `https://example.test/${providerKey}`,
    safetyStatus: "allowed",
    publishedAt: new Date("2026-08-18T10:00:00.000Z"),
    observedAt: new Date("2026-08-18T10:05:00.000Z"),
    ingestionCutoff: new Date("2026-08-19T00:00:00.000Z"),
  });

const input = (
  provider: string,
  facts: ReturnType<typeof readerPostPromotionFacts>,
): ReaderPostPromotionInput => ({
  candidateId: `candidate-${provider}`,
  provider,
  contentKind: facts.contentKind,
  canonicalIdentity: facts.canonicalIdentity,
  citationId: `citation-${provider}`,
  publishedAt: new Date("2026-08-18T10:00:00.000Z"),
  observedAt: new Date("2026-08-18T10:05:00.000Z"),
  periodStart: new Date("2026-08-18T00:00:00.000Z"),
  periodEnd: new Date("2026-08-19T00:00:00.000Z"),
  ingestionCutoff: new Date("2026-08-19T00:00:00.000Z"),
  freshnessValid: facts.freshnessValid,
  qualityScore: 0.9,
  relevanceScore: 0.9,
  integrityScore: 0.9,
  qualityValid: true,
  safetyValid: facts.safetyValid,
  citationValid: true,
  metricsState: facts.metricsState,
  metrics: facts.metrics,
  whyImportant: "Production-path metamorphic evidence.",
});

function cases(): readonly {
  readonly provider: string;
  readonly baseline: JsonObject;
  readonly mutated: JsonObject;
}[] { return [
  {
    provider: "x-twitter",
    baseline: {
      kind: "x_post", contentKind: "original_post", likes: 50, reposts: 20,
    },
    mutated: {
      kind: "x_post", contentKind: "original_post", likes: 50, reposts: 20,
      replies: -1, quotes: "broken", bookmarks: Number.MAX_VALUE,
      promotionMetricsState: "conflict",
      public_metrics: { reply_count: 1, replyCount: 999, quote_count: null },
      metrics: { replies: {}, quotes: [], bookmarks: -50, impressions: "huge" },
    },
  },
  {
    provider: "reddit",
    baseline: { kind: "reddit_post", score: 70, upvoteRatio: 0.9 },
    mutated: {
      kind: "reddit_post", score: 70, upvoteRatio: 0.9,
      comments: -1, numComments: Number.MAX_VALUE,
      promotionMetricsState: "malformed",
    },
  },
  {
    provider: "hacker-news",
    baseline: { kind: "hacker_news_story", points: 80 },
    mutated: {
      kind: "hacker_news_story", points: 80, comments: { conflict: true },
      promotionMetricsState: "missing",
    },
  },
]; }
