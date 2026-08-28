import {
  readerSummaryArtifact,
  topRead,
} from "./prisma-reader-summary-artifact-fixture.spec-support";
import { selectReaderPostPromotions } from
  "../../../domain/policies/reader-post-promotion-selection";
import {
  buildReaderPostPromotionAttestations,
  canonicalPromotionPayload,
  promotionPayloadDigest,
} from
  "../../../domain/services/reader-post-promotion-attestation";
import { ReaderSummaryArtifact } from "../../../domain/entities/reader-summary-artifact";
import { assertReaderSummaryPromotionAttestations } from
  "../../../domain/entities/reader-summary-promotion-attestation-validation";

describe("ReaderSummaryArtifact promotion immutability", () => {
  it("rehydrates a pre-rollout V1 attestation with legacy peer facts", () => {
    const fixture = legacyPeerContextFixture(
      new Date("2026-08-27T13:48:17.317Z"),
    );

    expect(() => assertReaderSummaryPromotionAttestations(
      fixture.props,
      fixture.attestations,
    )).not.toThrow();
  });

  it("does not allow legacy peer verification after its rollout boundary", () => {
    const fixture = legacyPeerContextFixture(
      new Date("2026-08-27T21:11:02.430Z"),
    );

    expect(() => assertReaderSummaryPromotionAttestations(
      fixture.props,
      fixture.attestations,
    )).toThrow(
      "Reader summary promotion attestation differs from persisted evidence facts",
    );
  });

  it("validates semantic-cluster support in the persisted peer context", () => {
    const base = readerSummaryArtifact("artifact-contextual-attestation")
      .toSnapshot();
    const periodStart = new Date("2026-07-05T00:00:00.000Z");
    const periodEnd = new Date("2026-07-06T00:00:00.000Z");
    const publishedAt = new Date("2026-07-05T08:00:00.000Z");
    const observedAt = new Date("2026-07-05T08:05:00.000Z");
    const cutoff = new Date("2026-07-05T09:00:00.000Z");
    const common = {
      clusterId: "cluster:runtime-release",
      publishedAt,
      observedAt,
      periodStart,
      periodEnd,
      ingestionCutoff: cutoff,
      freshnessValid: true,
      qualityScore: 0.9,
      relevanceScore: 0.9,
      integrityScore: 0.9,
      qualityValid: true,
      safetyValid: true,
      citationValid: true,
      metricsState: "observed" as const,
    };
    const selection = selectReaderPostPromotions([{
      ...common,
      candidateId: "feed-context-lead",
      provider: "reddit",
      contentKind: "original_post",
      canonicalIdentity: "story:runtime-release-reddit",
      citationId: "citation-context-lead",
      metrics: { provider: "reddit", score: 500, upvoteRatio: 0.95 },
    }, {
      ...common,
      candidateId: "feed-context-support",
      provider: "hacker-news",
      contentKind: "story",
      canonicalIdentity: "story:runtime-release-hn",
      citationId: "citation-context-support",
      metrics: { provider: "hacker_news", points: 50 },
    }]);
    const selected = selection.top[0]!;
    expect(selected.support).toHaveLength(1);
    const sourceWindow = {
      ...base.sourceWindow,
      selectedFeedItemIds: ["feed-context-lead", "feed-context-support"],
      periodStartedAt: periodStart,
      periodEndedAt: periodEnd,
      ingestionCutoff: cutoff,
    };
    const attestations = buildReaderPostPromotionAttestations(selection, {
      artifactId: base.readerSummaryId,
      sourceWindow,
    });

    expect(() => assertReaderSummaryPromotionAttestations({
      ...base,
      sourceWindow,
      citationMap: [{
        citationId: "citation-context-lead",
        feedItemId: "feed-context-lead",
        sourceItemId: "source-context-lead",
        providerKey: "reddit",
        field: "canonicalUrl",
      }, {
        citationId: "citation-context-support",
        feedItemId: "feed-context-support",
        sourceItemId: "source-context-support",
        providerKey: "hacker-news",
        field: "canonicalUrl",
      }],
      content: {
        ...base.content!,
        topReads: [{
          ...topRead(),
          promotionMarker: "reader_post_promotion",
          promotionPolicyVersion: "reader_post_promotion.v1",
          promotionTier: "top",
          promotionCandidateId: selected.candidate.candidateId,
          promotionCanonicalIdentity: selected.candidate.canonicalIdentity,
          citationIds: selected.citationIds,
        }],
        selectedPosts: [],
      },
      promotionAttestations: attestations,
      promotionEvidenceFacts: [selected.candidate, ...selected.support],
    }, attestations)).not.toThrow();
  });

  it("isolates nested signed support facts from input and snapshot mutation", () => {
    const base = readerSummaryArtifact("artifact-promotion-immutability")
      .toSnapshot();
    const periodStart = new Date("2026-07-05T00:00:00.000Z");
    const periodEnd = new Date("2026-07-06T00:00:00.000Z");
    const publishedAt = new Date("2026-07-05T08:00:00.000Z");
    const observedAt = new Date("2026-07-05T08:05:00.000Z");
    const cutoff = new Date("2026-07-05T09:00:00.000Z");
    const sourceWindow = {
      windowId: "reader-window",
      startedAt: new Date(publishedAt),
      endedAt: new Date(cutoff),
      selectedFeedItemIds: ["feed-1", "feed-2"],
      storyClusterIds: ["story-1"],
      periodStartedAt: new Date(periodStart),
      periodEndedAt: new Date(periodEnd),
      ingestionCutoff: new Date(cutoff),
    };
    const selection = selectReaderPostPromotions([{
      candidateId: "feed-1",
      provider: "reddit",
      contentKind: "original_post",
      canonicalIdentity: "story:runtime-release",
      citationId: "citation-1",
      publishedAt,
      observedAt,
      periodStart,
      periodEnd,
      ingestionCutoff: cutoff,
      freshnessValid: true,
      qualityScore: 0.9,
      relevanceScore: 0.9,
      integrityScore: 0.9,
      qualityValid: true,
      safetyValid: true,
      citationValid: true,
      metricsState: "observed",
      metrics: { provider: "reddit", score: 50, upvoteRatio: 0.6 },
    }, {
      candidateId: "feed-2",
      provider: "hacker-news",
      contentKind: "story",
      canonicalIdentity: "story:runtime-release-support",
      citationId: "citation-2",
      publishedAt,
      observedAt,
      periodStart,
      periodEnd,
      ingestionCutoff: cutoff,
      freshnessValid: true,
      qualityScore: 0.8,
      relevanceScore: 0.8,
      integrityScore: 0.8,
      qualityValid: true,
      safetyValid: true,
      citationValid: true,
      authorityAttestation: {
        status: "attested",
        official: true,
        trusted: true,
        attestedBy: "source_catalog",
      },
      metricsState: "observed",
      metrics: { provider: "hacker_news", points: 25 },
      relation: {
        kind: "same_story",
        targetCanonicalIdentity: "story:runtime-release",
        confidence: 0.95,
        approved: true,
      },
    }]);
    const attestations = buildReaderPostPromotionAttestations(selection, {
      artifactId: base.readerSummaryId,
      sourceWindow,
    });
    const promotedCard = {
      ...topRead(),
      promotionMarker: "reader_post_promotion" as const,
      promotionPolicyVersion: "reader_post_promotion.v1" as const,
      promotionTier: "top" as const,
      promotionCandidateId: "feed-1",
      promotionCanonicalIdentity: "story:runtime-release",
      providerKey: "reddit",
      providerName: "Reddit",
      confirmedProviderKeys: ["hacker-news", "reddit"],
      canonicalUrl: "https://reddit.example.test/runtime-release",
      citationIds: ["citation-1", "citation-2"],
    };
    const artifact = ReaderSummaryArtifact.create({
      ...base,
      period: {
        ...base.period,
        startedAt: periodStart,
        endedAt: periodEnd,
      },
      sourceWindow,
      storyClusters: [{
        ...base.storyClusters[0]!,
        representativeFeedItemId: "feed-1",
        duplicateFeedItemIds: ["feed-2"],
        providerKeys: ["hacker-news", "reddit"],
      }],
      citationMap: [{
        ...base.citationMap[0]!,
        providerKey: "reddit",
        canonicalUrl: promotedCard.canonicalUrl,
      }, {
        citationId: "citation-2",
        feedItemId: "feed-2",
        sourceItemId: "source-2",
        providerKey: "hacker-news",
        field: "canonicalUrl",
        canonicalUrl: "https://news.ycombinator.com/item?id=runtime-release",
      }],
      topStories: base.topStories.map((story) => ({
        ...story,
        providerKeys: ["hacker-news", "reddit"],
        citationIds: ["citation-1", "citation-2"],
      })),
      content: {
        ...base.content!,
        sourceMix: [{
          providerKey: "reddit",
          itemCount: 1,
          citationCount: 1,
          storyClusterCount: 1,
          crossSourceClusterCount: 1,
          singleSourceOnly: false,
          interestIds: ["interest-ai"],
        }, {
          providerKey: "hacker-news",
          itemCount: 1,
          citationCount: 1,
          storyClusterCount: 1,
          crossSourceClusterCount: 1,
          singleSourceOnly: false,
          interestIds: ["interest-ai"],
        }],
        topReads: [promotedCard],
        selectedPosts: [],
      },
      promotionAttestations: attestations,
      promotionEvidenceFacts: [...selection.top, ...selection.additional]
        .flatMap((item) => [item.candidate, ...item.support]),
    });

    periodStart.setUTCFullYear(1998);
    periodEnd.setUTCFullYear(1998);
    sourceWindow.startedAt.setUTCFullYear(1998);
    sourceWindow.endedAt.setUTCFullYear(1998);
    sourceWindow.ingestionCutoff!.setUTCFullYear(1998);
    sourceWindow.periodStartedAt!.setUTCFullYear(1998);
    sourceWindow.periodEndedAt!.setUTCFullYear(1998);
    sourceWindow.selectedFeedItemIds.push("feed-forged");
    sourceWindow.storyClusterIds.push("story-forged");
    const protectedWindow = artifact.toSnapshot();
    expect(protectedWindow.period.startedAt.getUTCFullYear()).toBe(2026);
    expect(protectedWindow.period.endedAt.getUTCFullYear()).toBe(2026);
    expect(protectedWindow.sourceWindow.ingestionCutoff?.getUTCFullYear())
      .toBe(2026);
    expect(protectedWindow.sourceWindow.periodStartedAt?.getUTCFullYear())
      .toBe(2026);
    expect(protectedWindow.sourceWindow.periodEndedAt?.getUTCFullYear())
      .toBe(2026);
    expect(protectedWindow.sourceWindow.selectedFeedItemIds)
      .toEqual(["feed-1", "feed-2"]);
    expect(protectedWindow.sourceWindow.storyClusterIds).toEqual(["story-1"]);

    protectedWindow.period.startedAt.setUTCFullYear(1997);
    protectedWindow.period.endedAt.setUTCFullYear(1997);
    protectedWindow.sourceWindow.startedAt.setUTCFullYear(1997);
    protectedWindow.sourceWindow.endedAt.setUTCFullYear(1997);
    protectedWindow.sourceWindow.ingestionCutoff?.setUTCFullYear(1997);
    protectedWindow.sourceWindow.periodStartedAt?.setUTCFullYear(1997);
    protectedWindow.sourceWindow.periodEndedAt?.setUTCFullYear(1997);
    (protectedWindow.sourceWindow.selectedFeedItemIds as string[])
      .push("feed-snapshot-forged");
    (protectedWindow.sourceWindow.storyClusterIds as string[])
      .push("story-snapshot-forged");
    const protectedAgain = artifact.toSnapshot();
    expect(protectedAgain.period.startedAt.getUTCFullYear()).toBe(2026);
    expect(protectedAgain.period.endedAt.getUTCFullYear()).toBe(2026);
    expect(protectedAgain.sourceWindow.ingestionCutoff?.getUTCFullYear())
      .toBe(2026);
    expect(protectedAgain.sourceWindow.periodStartedAt?.getUTCFullYear())
      .toBe(2026);
    expect(protectedAgain.sourceWindow.periodEndedAt?.getUTCFullYear())
      .toBe(2026);
    expect(protectedAgain.sourceWindow.selectedFeedItemIds)
      .toEqual(["feed-1", "feed-2"]);
    expect(protectedAgain.sourceWindow.storyClusterIds).toEqual(["story-1"]);

    const inputFact = attestations[0]!.supportFacts[0]!;
    inputFact.publishedAt.setUTCFullYear(1999);
    (inputFact.relation as { confidence: number }).confidence = 0;
    (inputFact.authorityAttestation as { official: boolean }).official = false;
    if (inputFact.metrics?.provider === "hacker_news") {
      (inputFact.metrics as { points: number }).points = 0;
    }
    const snapshotFact = artifact.toSnapshot().promotionAttestations![0]!
      .supportFacts[0]!;
    expect(snapshotFact.publishedAt.getUTCFullYear()).toBe(2026);
    expect(snapshotFact.relation?.confidence).toBe(0.95);
    expect(snapshotFact.authorityAttestation?.official).toBe(true);
    expect(snapshotFact.metrics).toMatchObject({ points: 25 });

    snapshotFact.publishedAt.setUTCFullYear(2000);
    (snapshotFact.relation as { confidence: number }).confidence = 0;
    (snapshotFact.authorityAttestation as { official: boolean }).official = false;
    const protectedFact = artifact.toSnapshot().promotionAttestations![0]!
      .supportFacts[0]!;
    expect(protectedFact.publishedAt.getUTCFullYear()).toBe(2026);
    expect(protectedFact.relation?.confidence).toBe(0.95);
    expect(protectedFact.authorityAttestation?.official).toBe(true);

    const mutations: readonly [
      string,
      (value: Record<string, unknown>) => void,
    ][] = [
      ["attestedBy", (value) => {
        nestedRecord(supportFact(value), "authorityAttestation").attestedBy =
          "producer";
      }],
      ["support whyImportant", (value) => {
        supportFact(value).whyImportant = "Rewritten after persistence";
      }],
      ["candidate", (value) => { value.candidateId = "feed-forged"; }],
      ["provider", (value) => { value.provider = "hacker-news"; }],
      ["content kind", (value) => { value.contentKind = "story"; }],
      ["canonical identity", (value) => {
        value.canonicalIdentity = "story:forged";
      }],
      ["citation", (value) => { value.citationId = "citation-2"; }],
      ["source window", (value) => { value.sourceWindowId = "window-forged"; }],
      ["timestamp", (value) => {
        value.observedAt = new Date("2026-07-05T08:06:00.000Z");
      }],
      ["metrics", (value) => { nestedRecord(value, "metrics").score = 51; }],
      ["gates", (value) => { value.qualityValid = false; }],
      ["usefulness", (value) => {
        const usefulness = nestedRecord(value, "usefulnessComponents");
        usefulness.total = (usefulness.total as number) + 0.01;
      }],
      ["dedupe", (value) => {
        value.canonicalDedupeOutcome = "deduplicated";
      }],
      ["cap", (value) => { value.capOutcome = "excluded_by_cap"; }],
    ];
    for (const [label, mutate] of mutations) {
      const currentSnapshot = artifact.toSnapshot();
      const mutatedSnapshot = {
        ...currentSnapshot,
        period: {
          ...currentSnapshot.period,
          startedAt: new Date(currentSnapshot.period.startedAt),
          endedAt: new Date(currentSnapshot.period.endedAt),
        },
        sourceWindow: {
          ...currentSnapshot.sourceWindow,
          startedAt: new Date(currentSnapshot.sourceWindow.startedAt),
          endedAt: new Date(currentSnapshot.sourceWindow.endedAt),
        },
      };
      const mutated = mutatedSnapshot.promotionAttestations![0]! as unknown as
        Record<string, unknown>;
      mutate(mutated);
      const body = { ...mutated };
      delete body.digest;
      delete body.canonicalPayload;
      mutated.canonicalPayload = canonicalPromotionPayload(body);
      mutated.digest = promotionPayloadDigest(mutated.canonicalPayload as string);
      try {
        ReaderSummaryArtifact.rehydrate(mutatedSnapshot);
        throw new Error(`${label}: mutated attestation was accepted`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(`${label}: ${message}`).toMatch(
          /promotion attestation|persisted evidence/u,
        );
      }
      expect(label).not.toHaveLength(0);
    }
  });
});

const legacyPeerContextFixture = (generatedAt: Date) => {
  const base = readerSummaryArtifact("artifact-legacy-peer-context")
    .toSnapshot();
  const periodStart = new Date("2026-08-26T00:00:00.000Z");
  const periodEnd = new Date("2026-08-27T00:00:00.000Z");
  const cutoff = new Date("2026-08-27T00:00:00.000Z");
  const lead = {
    candidateId: "feed-legacy-lead",
    provider: "reddit",
    contentKind: "original_post" as const,
    canonicalIdentity: "story:legacy-lead",
    citationId: "citation-legacy-lead",
    publishedAt: new Date("2026-08-26T08:00:00.000Z"),
    observedAt: new Date("2026-08-26T08:05:00.000Z"),
    periodStart,
    periodEnd,
    ingestionCutoff: cutoff,
    freshnessValid: true,
    qualityScore: 0.9,
    relevanceScore: 0.9,
    integrityScore: 0.9,
    qualityValid: true,
    safetyValid: true,
    citationValid: true,
    metricsState: "observed" as const,
    metrics: { provider: "reddit" as const, score: 500, upvoteRatio: 0.95 },
  };
  const peer = {
    ...lead,
    candidateId: "feed-peer-added-before-contextual-verification",
    provider: "hacker-news",
    contentKind: "story" as const,
    canonicalIdentity: "story:legacy-peer",
    citationId: "citation-legacy-peer",
    metrics: { provider: "hacker_news" as const, points: 100 },
  };
  const selection = selectReaderPostPromotions([lead]);
  const sourceWindow = {
    ...base.sourceWindow,
    selectedFeedItemIds: [lead.candidateId, peer.candidateId],
    periodStartedAt: periodStart,
    periodEndedAt: periodEnd,
    ingestionCutoff: cutoff,
  };
  const attestations = buildReaderPostPromotionAttestations(selection, {
    artifactId: base.readerSummaryId,
    sourceWindow,
  });
  const selected = selection.top[0]!;

  return {
    attestations,
    props: {
      ...base,
      generatedAt,
      sourceWindow,
      citationMap: [{
        citationId: lead.citationId,
        feedItemId: lead.candidateId,
        sourceItemId: "source-legacy-lead",
        providerKey: lead.provider,
        field: "canonicalUrl" as const,
      }, {
        citationId: peer.citationId,
        feedItemId: peer.candidateId,
        sourceItemId: "source-legacy-peer",
        providerKey: peer.provider,
        field: "canonicalUrl" as const,
      }],
      content: {
        ...base.content!,
        topReads: [{
          ...topRead(),
          promotionMarker: "reader_post_promotion" as const,
          promotionPolicyVersion: "reader_post_promotion.v1" as const,
          promotionTier: "top" as const,
          promotionCandidateId: selected.candidate.candidateId,
          promotionCanonicalIdentity: selected.candidate.canonicalIdentity,
          citationIds: selected.citationIds,
        }],
        selectedPosts: [],
      },
      promotionAttestations: attestations,
      promotionEvidenceFacts: [lead, peer],
    },
  };
};

const nestedRecord = (
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> => value[key] as Record<string, unknown>;

const supportFact = (
  value: Record<string, unknown>,
): Record<string, unknown> =>
  (value.supportFacts as Record<string, unknown>[])[0]!;
