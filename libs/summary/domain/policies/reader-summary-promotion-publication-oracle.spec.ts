import type { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import type { ReaderSummaryContent } from "../entities/reader-summary-artifact";
import { ReaderSummaryPublicationPolicy } from "./reader-summary-publication-policy";
import { readerSummaryPromotionPublicationOracle } from
  "./reader-summary-promotion-publication-oracle";
import { buildReaderPostPromotionProjection } from
  "../services/reader-post-promotion-projection";
import type { SummaryEvidenceItem } from
  "../value-objects/summary-evidence-item";
import {
  promotionPublicationFixture,
  exactObservedPromotionPublicationFixture,
  trustedNonOfficialSupportPublicationFixture,
  withUncheckedPublicationCards,
} from "./reader-summary-promotion-publication-test-fixtures";
import { dailyEvidenceSelection } from
  "./reader-summary-publication-policy-test-fixtures";

const policy = new ReaderSummaryPublicationPolicy();

describe("ReaderSummaryPublicationPolicy Promotion V1 oracle", () => {
  it("accepts trusted source-catalog non-official cross-provider support", () => {
    const fixture = trustedNonOfficialSupportPublicationFixture();
    expect(fixture.artifact.toSnapshot().content?.topReads[0]?.citationIds)
      .toEqual(["citation-publication-1", "citation-publication-2"]);
    const result = readerSummaryPromotionPublicationOracle({
      evidence: fixture.evidence.selectedEvidence,
      citations: fixture.artifact.toSnapshot().citationMap,
      sourceWindow: fixture.evidence.sourceWindow,
      approvedSameStoryRelations:
        fixture.evidence.approvedSameStoryRelations,
    });
    expect(result.top[0]?.citationIds).toEqual([
      "citation-publication-1",
      "citation-publication-2",
    ]);
  });
  it("does not let official provenance replace a zero engagement rating", () => {
    const fixture = promotionPublicationFixture(25);
    const evidence = fixture.evidence.selectedEvidence.map((item, index) =>
      index !== 0 ? item : {
        ...item,
        promotionFacts: {
          ...item.promotionFacts!,
          authorityAttestation: {
            status: "attested" as const,
            official: true,
            trusted: true,
            attestedBy: "source_catalog" as const,
          },
          metrics: { provider: "reddit" as const, score: 0 },
        },
      });
    const result = readerSummaryPromotionPublicationOracle({
      evidence,
      citations: fixture.artifact.toSnapshot().citationMap,
      sourceWindow: fixture.evidence.sourceWindow,
      clusters: fixture.evidence.clusters,
    });
    expect([...result.top, ...result.additional].map((item) => item.candidateId))
      .not.toContain("feed-publication-1");
  });
  it("rejects reordered Top and Additional promotion arrays", () => {
    const fixture = promotionPublicationFixture(25);
    const snapshot = fixture.artifact.toSnapshot();
    const topReads = [snapshot.content!.selectedPosts![0]!];
    const selectedPosts = [snapshot.content!.topReads[0]!];
    expect(
      policy.evaluate({
        artifact: withUncheckedPublicationCards(fixture.artifact, {
          topReads,
          selectedPosts,
        }),
        evidence: fixture.evidence,
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: ["top_read_ineligible_source"],
    });
  });

  it("orders exact promotion provenance one microsecond apart", () => {
    const fixture = promotionPublicationFixture(50);
    const snapshot = fixture.artifact.toSnapshot();
    const evidence = fixture.evidence.selectedEvidence.map((item, index) => ({
      ...item,
      publishedAt: new Date("2026-07-05T08:00:00.123Z"),
      promotionFacts: {
        ...item.promotionFacts!,
        freshnessProvenance: {
          status: "observed" as const,
          publishedAt: new Date("2026-07-05T08:00:00.123Z"),
          observedAt: item.observedAt,
          ingestionCutoff: fixture.evidence.sourceWindow.ingestionCutoff!,
          exactPublishedAt: index === 0
            ? "2026-07-05T08:00:00.123000Z"
            : "2026-07-05T08:00:00.123001Z",
        },
      },
    }));

    const result = readerSummaryPromotionPublicationOracle({
      evidence,
      citations: snapshot.citationMap,
      sourceWindow: fixture.evidence.sourceWindow,
      clusters: fixture.evidence.clusters,
    });

    expect(result.top.map((item) => item.candidateId)).toEqual([
      evidence[1]!.feedItemId,
      evidence[0]!.feedItemId,
    ]);
  });

  it("applies the production provider cap to independent Top verification", () => {
    const source = dailyEvidenceSelection(50);
    const makeCandidate = (
      provider: "reddit" | "hacker-news" | "x-twitter",
      index: number,
    ): SummaryEvidenceItem => {
      const template = provider === "hacker-news"
        ? source.selectedEvidence[1]!
        : source.selectedEvidence[0]!;
      const canonicalUrl = provider === "reddit"
        ? `https://reddit.example.test/post/${index}`
        : provider === "hacker-news"
          ? `https://news.example.test/item/${index}`
          : `https://x.com/example/status/${index}`;
      const metrics: NonNullable<
        NonNullable<SummaryEvidenceItem["promotionFacts"]>["metrics"]
      > = provider === "reddit"
        ? { provider: "reddit", score: 50, upvoteRatio: 0.9 }
        : provider === "hacker-news"
          ? { provider: "hacker_news", points: 50 }
          : { provider: "x", likes: 100, reposts: 50, weightedScore: 200 };
      return {
        ...template,
        feedItemId: `feed-${provider}-${index}`,
        sourceItemId: `source-${provider}-${index}`,
        sourceBindingId: `binding-${provider}-${index}`,
        providerKey: provider,
        providerName: provider,
        canonicalUrl,
        title: `${provider} candidate ${index}`,
        contentQuality: {
          ...template.contentQuality!,
          qualityScore: provider === "reddit" ? 1 :
            provider === "hacker-news" ? 0.8 : 0.7,
        },
        promotionFacts: {
          ...template.promotionFacts!,
          contentKind: provider === "hacker-news" ? "story" : "original_post",
          canonicalIdentity: `url:${canonicalUrl}`,
          metrics,
        },
      };
    };
    const evidence = [
      ...Array.from({ length: 6 }, (_, index) =>
        makeCandidate("reddit", index)),
      ...Array.from({ length: 3 }, (_, index) =>
        makeCandidate("hacker-news", index)),
      makeCandidate("x-twitter", 0),
    ];
    const citations = evidence.map((item, index) => ({
      citationId: `citation-provider-cap-${index}`,
      feedItemId: item.feedItemId,
      sourceItemId: item.sourceItemId,
      providerKey: item.providerKey,
      field: "title" as const,
      canonicalUrl: item.canonicalUrl,
    }));
    const sourceWindow = {
      ...source.sourceWindow,
      selectedFeedItemIds: evidence.map((item) => item.feedItemId),
      storyClusterIds: [],
    };
    const projection = buildReaderPostPromotionProjection({
      evidence,
      clusters: [],
      citations,
      sourceWindow,
    });
    const oracle = readerSummaryPromotionPublicationOracle({
      evidence,
      citations,
      sourceWindow,
    });

    expect(oracle.top.map((item) => item.candidateId)).toEqual(
      projection.topReads.map((item) => item.promotionCandidateId),
    );
    expect(projection.topReads.map((item) => item.providerKey)).toEqual([
      "reddit",
      "hacker-news",
      "x-twitter",
      "reddit",
      "reddit",
      "reddit",
      "hacker-news",
      "hacker-news",
    ]);
  });

  it.each([
    ["cutoff -1us", "2026-07-05T08:59:59.999999Z", true],
    ["cutoff equal", "2026-07-05T09:00:00.000000Z", true],
    ["cutoff +1us", "2026-07-05T09:00:00.000001Z", false],
  ] as const)("creates exact artifacts at %s", (_name, exactObservedAt, admitted) => {
    const artifact = exactObservedPromotionPublicationFixture(exactObservedAt);
    const candidateIds = artifact.toSnapshot().content!.topReads.map((item) =>
      item.promotionCandidateId);
    expect(candidateIds.includes("feed-publication-1")).toBe(admitted);
  });

  it.each([
    [
      "duplicate",
      (items: readonly NonNullable<ReaderSummaryContent["selectedPosts"]>[number][]) => [
        ...items,
        items[items.length - 1]!,
      ],
    ],
    [
      "missing",
      (items: readonly NonNullable<ReaderSummaryContent["selectedPosts"]>[number][]) =>
        items.slice(0, -1),
    ],
    [
      "extra",
      (items: readonly NonNullable<ReaderSummaryContent["selectedPosts"]>[number][]) => [
        ...items,
        {
          ...items[items.length - 1]!,
          canonicalUrl: "https://news.example.test/item/extra",
        },
      ],
    ],
  ] as const)("rejects %s promotion cards", (_name, mutate) => {
    const fixture = promotionPublicationFixture(25);
    const selectedPosts = mutate(
      fixture.artifact.toSnapshot().content!.selectedPosts!,
    );
    expect(
      policy.evaluate({
        artifact: withUncheckedPublicationCards(fixture.artifact, {
          selectedPosts,
        }),
        evidence: fixture.evidence,
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: ["top_read_ineligible_source"],
    });
  });

  it("rejects an otherwise exact unmarked promotion card", () => {
    const fixture = promotionPublicationFixture(25);
    const snapshot = fixture.artifact.toSnapshot();
    const unmarked = { ...snapshot.content!.topReads[0]! };
    delete (unmarked as { promotionMarker?: string }).promotionMarker;
    expect(
      policy.evaluate({
        artifact: withUncheckedPublicationCards(fixture.artifact, {
          topReads: [unmarked],
          selectedPosts: [
            unmarked,
            ...snapshot.content!.selectedPosts!.slice(1),
          ],
        }),
        evidence: fixture.evidence,
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: ["top_read_ineligible_source"],
    });
  });

  it("does not let an omitted model citation shrink the expected board", () => {
    const fixture = promotionPublicationFixture(25);
    const snapshot = fixture.artifact.toSnapshot();
    expect([
      ...snapshot.content!.topReads,
      ...snapshot.content!.selectedPosts!,
    ]).toHaveLength(2);
    expect(snapshot.citationMap).toHaveLength(2);
    const artifactWithoutSecondCitation = {
      toSnapshot: () => ({
        ...snapshot,
        citationMap: snapshot.citationMap.slice(0, 1),
      }),
    } as unknown as ReaderSummaryArtifact;
    expect(
      policy.evaluate({
        artifact: artifactWithoutSecondCitation,
        evidence: fixture.evidence,
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["top_read_ineligible_source"]),
    });
  });

  it("rejects an admission false negative for an HN Additional boundary from raw evidence", () => {
    const fixture = promotionPublicationFixture(25);
    const artifactWithoutBoundaryCard = withUncheckedPublicationCards(
      fixture.artifact,
      { selectedPosts: [] },
    );
    expect(
      policy.evaluate({
        artifact: artifactWithoutBoundaryCard,
        evidence: fixture.evidence,
      }),
    ).toMatchObject({
      status: "rejected",
      findings: expect.arrayContaining([
        expect.objectContaining({
          reason: expect.stringContaining("Additional array differs"),
        }),
      ]),
    });
  });

  it.each([
    ["tier", { promotionTier: "additional" }],
    ["policy version", { promotionPolicyVersion: "reader_post_promotion.v0" }],
  ] as const)(
    "rejects an independently wrong promotion %s",
    (_name, mutation) => {
      const fixture = promotionPublicationFixture(50);
      const snapshot = fixture.artifact.toSnapshot();
      const wrong = {
        ...snapshot.content!.topReads[0]!,
        ...mutation,
      } as unknown as NonNullable<ReaderSummaryContent["topReads"]>[number];
      expect(
        policy.evaluate({
          artifact: withUncheckedPublicationCards(fixture.artifact, {
            topReads: [wrong, ...snapshot.content!.topReads.slice(1)],
            selectedPosts: [
              wrong,
              ...snapshot.content!.selectedPosts!.slice(1),
            ],
          }),
          evidence: fixture.evidence,
        }),
      ).toMatchObject({
        status: "rejected",
        reasonCodes: ["top_read_ineligible_source"],
      });
    },
  );

  it("rejects an internally consistent production projection when raw evidence is below the immutable floor", () => {
    const fixture = promotionPublicationFixture(25);
    const evidence = {
      ...fixture.evidence,
      selectedEvidence: fixture.evidence.selectedEvidence.map((item) =>
        item.feedItemId === "feed-publication-2"
          ? {
              ...item,
              promotionFacts: {
                ...item.promotionFacts!,
                metrics: { provider: "hacker_news" as const, points: 24 },
              },
            }
          : item,
      ),
    };
    expect(policy.evaluate({ artifact: fixture.artifact, evidence })).toMatchObject(
      {
        status: "rejected",
        reasonCodes: expect.arrayContaining(["top_read_ineligible_source"]),
      },
    );
  });
});
