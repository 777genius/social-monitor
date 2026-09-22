import type { ReaderValueAssessmentStore,
  ReaderValueAssessment } from
  "@social-monitor/relevance/application/contracts/reader-value-assessment-store";
import type { ReaderValueAnswers, ReaderValueCriterion } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryJob, type ReaderSummaryPreparationManifest } from
  "../../domain";
import type { SummaryEvidenceItem } from "../../domain";
import type { ReaderSummarySupplementalEvidenceSelectorPort } from "../../ports";
import { sealReaderPostPresentationV3,
  type PromotionPresentationBuilder,
  type ReaderPostPresentationV3Input } from
  "../../domain/services/reader-post-presentation-v3";
import { promotionPayloadDigest } from
  "../../domain/services/reader-post-promotion-attestation";
import { buildReaderPostPromotionProjection } from
  "../../domain/services/reader-post-promotion-projection";
import { RelevanceReaderSummaryV3Promotion } from
  "./relevance-reader-summary-v3-promotion";
import { assertV3PromotionAttestation } from
  "../persistence/prisma/prisma-reader-summary-promotion-v3-schema";

describe("RelevanceReaderSummaryV3Promotion", () => {
  it("falls through an unavailable story lead without raw-title fallback", async () => {
    const fixture = setup([
      candidate(1, "important", "central", "story-a"),
      candidate(2, "useful", "central", "story-a"),
      candidate(3, "useful", "relevant", "story-b"),
    ], new TestPresentation(new Set([id(1)])));

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.top.map((value) => value.candidateId))
      .toEqual([id(2), id(3)]);
    expect(result.evidence.selectedEvidence.every((item) =>
      item.readerHeadline?.status === "accepted")).toBe(true);
  });

  it("distinguishes no signal and presentation unavailable", async () => {
    const noise = setup([candidate(1, "noise", "central")],
      new TestPresentation());
    await expect(noise.subject.build({ job: noise.job, manifest: noise.manifest }))
      .resolves.toEqual({ kind: "no_signal" });

    const unavailable = setup([candidate(2, "useful", "relevant")],
      new TestPresentation(new Set([id(2)])));
    await expect(unavailable.subject.build({ job: unavailable.job,
      manifest: unavailable.manifest })).resolves.toEqual({
      kind: "presentation_unavailable",
    });
  });

  it("reuses canonical story-key deduplication without an explicit story id", async () => {
    const first = { ...candidate(1, "useful", "central"),
      canonicalIdentity: "https://example.test/shared", storyId: undefined };
    const second = { ...candidate(2, "useful", "relevant"),
      canonicalIdentity: "https://example.test/shared", storyId: undefined };
    const fixture = setup([first, second], new TestPresentation());

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.top.map((value) => value.candidateId))
      .toEqual([id(1)]);
    expect(result.evidence.clusters).toHaveLength(1);
    expect(result.evidence.clusters[0]?.duplicateFeedItemIds).toEqual([id(2)]);
  });

  it("reuses deterministic cross-provider story membership before V3 ordering", async () => {
    const sharedTimestamp = "2026-09-20T12:00:00.000001Z";
    const reddit = { ...candidate(1, "useful", "central", "legacy-reddit"),
      provider: "reddit", publishedAt: sharedTimestamp,
      canonicalIdentity:
        "https://www.reddit.com/r/ClaudeAI/comments/abc/claude_code_cache_security",
      title: "Claude Code session cache security concern gets traction",
      body: "Developers discuss Claude Code cache leakage and security impact." };
    const x = { ...candidate(2, "useful", "central", "legacy-x"),
      provider: "x-twitter", publishedAt: sharedTimestamp,
      canonicalIdentity: "https://x.com/example/status/123",
      title: "Claude Code security chatter focuses on session cache leak",
      body: "Builders mention Claude Code session cache risk and mitigation steps." };

    for (const candidates of [[reddit, x], [x, reddit]]) {
      const fixture = setup(candidates, new TestPresentation());
      const result = await fixture.subject.build({ job: fixture.job,
        manifest: fixture.manifest });

      expect(result.kind).toBe("ready");
      if (result.kind !== "ready") continue;
      expect(result.evidence.promotionV3?.top.map((value) => value.candidateId))
        .toEqual([id(1)]);
      expect(result.evidence.clusters).toHaveLength(1);
      expect(result.evidence.clusters[0]).toMatchObject({
        representativeFeedItemId: id(1), duplicateFeedItemIds: [id(2)],
        providerKeys: ["reddit", "x-twitter"],
      });
    }
  });

  it("attaches the frozen eligible GitHub projection beside V3 social evidence", async () => {
    const supplemental = new TestSupplementalEvidenceSelector(
      Array.from({ length: 10 }, (_, index) => githubEvidence(index + 1)),
    );
    const fixture = setup([candidate(1, "important", "central")],
      new TestPresentation(), supplemental);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(supplemental.calls).toHaveLength(1);
    expect(supplemental.calls[0]).toMatchObject({
      tenantId: id(901), workspaceId: id(902),
      scope: { type: "interest", interestId: id(903) },
      observedThrough: new Date("2026-09-21T00:00:00.000Z"),
    });
    expect(result.evidence.selectedEvidence).toHaveLength(11);
    expect(result.evidence.selectedEvidence[0]?.feedItemId).toBe(id(1));
    expect(result.evidence.selectedEvidence.slice(1).map((item) =>
      item.sourceBindingId)).toEqual(Array.from({ length: 10 }, () =>
      "github-binding"));
    expect(result.evidence.sourceWindow.selectedFeedItemIds).toEqual(
      result.evidence.selectedEvidence.map((item) => item.feedItemId),
    );
    expect(result.evidence.clusters).toHaveLength(1);
  });

  it("keeps supplemental evidence when V3 has no admitted social signal", async () => {
    const fixture = setup([candidate(1, "noise", "central")],
      new TestPresentation(), new TestSupplementalEvidenceSelector(
        Array.from({ length: 10 }, (_, index) => githubEvidence(index + 1)),
      ));

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.outcome).toBe("no_signal");
    expect(result.evidence.selectedEvidence).toHaveLength(10);
    expect(result.evidence.clusters).toEqual([]);
  });

  it("publishes one stable representative for feed items sharing an assessment source", async () => {
    const lead = candidate(1, "useful", "central", "story-a");
    const duplicate = { ...candidate(2, "useful", "central", "story-b"),
      sourceItemId: lead.sourceItemId, assessmentId: lead.assessmentId,
      sourceSnapshotSha256: lead.sourceSnapshotSha256,
      inputSha256: lead.inputSha256 };
    const fixture = setup([duplicate, lead], new TestPresentation());

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.selectedEvidence.map((item) => item.feedItemId))
      .toEqual([duplicate.id]);
    expect(result.evidence.clusters[0]).toMatchObject({
      representativeFeedItemId: duplicate.id,
      duplicateFeedItemIds: [lead.id],
    });
    expect(result.evidence.promotionV3?.excluded).toContainEqual({
      candidateId: lead.id, reason: "story_representative",
    });
    const item = result.evidence.selectedEvidence[0]!;
    const projection = buildReaderPostPromotionProjection({
      evidence: result.evidence.selectedEvidence,
      clusters: result.evidence.clusters,
      sourceWindow: result.evidence.sourceWindow,
      promotionV3: result.evidence.promotionV3,
      citations: [{ citationId: "citation-shared", feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId, providerKey: item.providerKey,
        field: "bodyPreview", canonicalUrl: item.canonicalUrl }],
      attestationBinding: { artifactId: id(997),
        sourceWindow: result.evidence.sourceWindow },
    });
    expect(projection.topReads).toHaveLength(1);
    expect(projection.admittedCitations).toHaveLength(1);
    expect(projection.admittedClusters[0]?.duplicateFeedItemIds).toEqual([lead.id]);
  });

  it("bounds presentation at 32 and marks the rest budget exhausted", async () => {
    const presentation = new TestPresentation();
    const fixture = setup(Array.from({ length: 35 }, (_, index) =>
      candidate(index + 1, "useful", "relevant", `story-${index + 1}`)),
    presentation);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    expect(presentation.attempted).toBe(32);
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.excluded.filter((value) =>
      value.reason === "presentation_budget_exhausted")).toHaveLength(3);
  });

  it("does not charge skipped representatives after their story succeeds", async () => {
    const sameStory = Array.from({ length: 32 }, (_, index) =>
      candidate(index + 1, "important", "central", "shared-story"));
    const laterStory = candidate(33, "useful", "relevant", "later-story");
    const presentation = new TestPresentation();
    const fixture = setup([...sameStory, laterStory], presentation);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    expect(presentation.attempted).toBe(2);
    if (result.kind !== "ready") return;
    expect(result.evidence.selectedEvidence.map((item) => item.feedItemId))
      .toEqual([id(32), id(33)]);
  });

  it("does not spend the shortlist on 32 bindings for one source", async () => {
    const duplicates = Array.from({ length: 32 }, (_, index) => ({
      ...candidate(index + 1, "important", "central", `explicit-${index + 1}`),
      sourceItemId: id(700),
    }));
    const distinct = candidate(33, "useful", "relevant", "distinct-story");
    const presentation = new TestPresentation();
    const fixture = setup([...duplicates, distinct], presentation);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    expect(presentation.attempted).toBe(2);
    if (result.kind !== "ready") return;
    expect(result.evidence.selectedEvidence.map((item) => item.feedItemId))
      .toEqual([id(32), id(33)]);
    expect(result.evidence.clusters[0]?.duplicateFeedItemIds).toHaveLength(31);
  });

  it("charges one local oversize attempt for 32 duplicate source bindings", async () => {
    const shared = candidate(1, "important", "central", "shared-story");
    const duplicates = Array.from({ length: 32 }, (_, index) => ({
      ...candidate(index + 1, "important", "central", `explicit-${index + 1}`),
      sourceItemId: shared.sourceItemId, assessmentId: shared.assessmentId,
      sourceSnapshotSha256: shared.sourceSnapshotSha256,
      inputSha256: shared.inputSha256, body: "a".repeat(64_001),
    }));
    const distinct = candidate(33, "useful", "relevant", "distinct-story");
    const presentation = new TestPresentation();
    const fixture = setup([...duplicates, distinct], presentation);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    expect(presentation.attempted).toBe(1);
    if (result.kind !== "ready") return;
    expect(result.evidence.selectedEvidence.map((item) => item.feedItemId))
      .toEqual([id(33)]);
    expect(result.evidence.promotionV3?.excluded.filter((value) =>
      value.reason === "presentation_unavailable")).toHaveLength(32);
  });

  it("reselects a same-story fallback after a local oversize batch outcome", async () => {
    const lead = { ...candidate(1, "important", "central", "shared-story"),
      body: "a".repeat(64_001) };
    const fallback = candidate(2, "useful", "central", "shared-story");
    const lower = Array.from({ length: 31 }, (_, index) =>
      candidate(index + 3, "useful", "relevant", `lower-${index}`));
    const presentation = new TestPresentation();
    const fixture = setup([lead, fallback, ...lower], presentation);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    expect(presentation.batches[0]).toEqual([id(33), id(32), id(31)]);
    expect(presentation.batches[1]?.[0]).toBe(id(2));
    expect(presentation.attempted).toBe(31);
  });

  it("still charges 32 distinct local oversize bindings", async () => {
    const oversized = Array.from({ length: 32 }, (_, index) => ({
      ...candidate(index + 1, "important", "central", `story-${index + 1}`),
      body: "a".repeat(64_001),
    }));
    const distinct = candidate(33, "useful", "relevant", "eligible-story");
    const presentation = new TestPresentation();
    const fixture = setup([...oversized, distinct], presentation);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result).toEqual({ kind: "presentation_unavailable" });
    expect(presentation.attempted).toBe(0);
  });

  it("reserves the highest-ranked eligible binding before 32 lower local failures", async () => {
    const eligible = candidate(1, "important", "central", "eligible-story");
    const oversized = Array.from({ length: 32 }, (_, index) => ({
      ...candidate(index + 2, "useful", "relevant", `oversize-${index + 1}`),
      body: "a".repeat(64_001),
    }));
    const presentation = new TestPresentation();
    const fixture = setup([eligible, ...oversized], presentation);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    expect(presentation.attempted).toBe(1);
    if (result.kind !== "ready") return;
    expect(result.evidence.selectedEvidence.map((item) => item.feedItemId))
      .toEqual([eligible.id]);
    expect(result.evidence.promotionV3?.excluded.filter((value) =>
      value.reason === "presentation_budget_exhausted")).toHaveLength(1);
  });

  it("fails the whole preparation on a presentation dependency failure", async () => {
    const fixture = setup([candidate(1, "useful", "relevant")], {
      build: async () => { throw new Error("presentation auth failed"); },
    });
    await expect(fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest })).resolves.toEqual({
      kind: "dependency_failure", reason: "presentation auth failed",
    });
  });

  it.each([12_001, 64_000])(
    "keeps the complete %i-character V3 source through presentation evidence",
    async (length) => {
      const tail = " Final qualification";
      const body = "a".repeat(length - tail.length) + tail;
      const fixture = setup([{ ...candidate(1, "useful", "central"), body }],
        new TestPresentation());

      const result = await fixture.subject.build({ job: fixture.job,
        manifest: fixture.manifest });

      expect(result.kind).toBe("ready");
      if (result.kind !== "ready") return;
      expect(result.evidence.selectedEvidence[0]?.sourceText).toBe(body);
      expect(result.evidence.selectedEvidence[0]?.sourceText).toHaveLength(length);
    },
  );

  it("rejects a complete source beyond the 64k V3 presentation envelope", async () => {
    const fixture = setup([{ ...candidate(1, "useful", "central"),
      body: "a".repeat(64_001) }], new TestPresentation());

    await expect(fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest })).resolves.toEqual({
      kind: "presentation_unavailable",
    });
  });

  it.each(["hacker-news", "x-twitter", "github-repo-radar"])(
    "preserves the production %s provider identity through publication projection",
    async (providerKey) => {
    const persisted = { ...candidate(1, "useful", "central"),
      provider: providerKey };
    const fixture = setup([persisted], new TestPresentation());

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    const selected = result.evidence.promotionV3?.top[0];
    const item = result.evidence.selectedEvidence[0]!;
    expect(selected?.providerKey).toBe(providerKey);
    expect(item.providerKey).toBe(providerKey);
    expect(item.readerHeadline?.status === "accepted" &&
      item.readerHeadline.binding.providerKey).toBe(providerKey);
    const projection = buildReaderPostPromotionProjection({
      evidence: result.evidence.selectedEvidence,
      clusters: result.evidence.clusters,
      sourceWindow: result.evidence.sourceWindow,
      promotionV3: result.evidence.promotionV3,
      citations: [{ citationId: "citation-provider", feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId, providerKey,
        field: "bodyPreview", canonicalUrl: item.canonicalUrl }],
      attestationBinding: { artifactId: id(998),
        sourceWindow: result.evidence.sourceWindow },
    });
    expect(projection.topReads[0]?.providerKey).toBe(providerKey);
    expect(projection.attestations[0]?.provider).toBe(providerKey);
    const publicHeadline = projection.attestations[0]?.schemaVersion ===
      "reader_post_promotion_attestation.v3"
      ? projection.attestations[0].presentation.displayHeadline.headline
      : undefined;
    if (publicHeadline?.status !== "accepted") {
      throw new Error("invalid public headline fixture");
    }
    const publicBinding = publicHeadline.binding;
    expect(publicBinding).toEqual(expect.objectContaining({
      interestDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(JSON.stringify(projection.attestations)).not.toContain("testing");
    expect(() => assertV3PromotionAttestation(
      projection.attestations[0] as unknown as Record<string, unknown>, 0,
    )).not.toThrow();
    const forgedIdentity = JSON.parse(JSON.stringify(
      projection.attestations[0],
    )) as { presentation: Record<string, unknown> };
    forgedIdentity.presentation.presentationIdentity = "0".repeat(64);
    expect(() => assertV3PromotionAttestation(forgedIdentity, 0)).toThrow(
      "presentation.presentationIdentity",
    );
  });

  it("normalizes DB timestamp spellings before strict V3 attestation mapping", async () => {
    const shaped = { ...candidate(1, "useful", "central"),
      publishedAt: "2026-09-20 00:00:01.123456+00:00",
      observedAt: "2026-09-20 00:01:01.000001+00",
      assessedAt: "2026-09-20 00:10:00.000001+00:00" };
    const fixture = setup([shaped], new TestPresentation());

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.top[0]).toMatchObject({
      publishedAt: "2026-09-20T00:00:01.123456Z",
      assessedAt: "2026-09-20T00:10:00.000001Z",
    });
    const item = result.evidence.selectedEvidence[0]!;
    const projection = buildReaderPostPromotionProjection({
      evidence: result.evidence.selectedEvidence,
      clusters: result.evidence.clusters,
      sourceWindow: result.evidence.sourceWindow,
      promotionV3: result.evidence.promotionV3,
      citations: [{ citationId: "citation-v3", feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId, providerKey: item.providerKey,
        field: "bodyPreview", canonicalUrl: item.canonicalUrl }],
      attestationBinding: { artifactId: id(999),
        sourceWindow: result.evidence.sourceWindow },
    });
    expect(projection.topReads[0]?.exactPublishedAt)
      .toBe("2026-09-20T00:00:01.123456Z");
    expect(projection.attestations[0]).toMatchObject({
      publishedAt: "2026-09-20T00:00:01.123456Z",
      comparator: { publishedAt: "2026-09-20T00:00:01.123456Z" },
    });
  });

  it("preserves the manifest microsecond cutoff through evidence and attestation", async () => {
    const fixture = setup([candidate(1, "useful", "central")],
      new TestPresentation());
    Object.assign(fixture.manifest, {
      cutoffAt: "2026-09-20T23:59:59.123456Z",
    });

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.sourceWindow.exactIngestionCutoff)
      .toBe("2026-09-20T23:59:59.123456Z");
    const item = result.evidence.selectedEvidence[0]!;
    const projection = buildReaderPostPromotionProjection({
      evidence: result.evidence.selectedEvidence, clusters: result.evidence.clusters,
      sourceWindow: result.evidence.sourceWindow,
      promotionV3: result.evidence.promotionV3,
      citations: [{ citationId: "citation-cutoff", feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId, providerKey: item.providerKey,
        field: "bodyPreview", canonicalUrl: item.canonicalUrl }],
      attestationBinding: { artifactId: id(996),
        sourceWindow: result.evidence.sourceWindow },
    });
    expect(projection.attestations[0]).toMatchObject({
      exactIngestionCutoff: "2026-09-20T23:59:59.123456Z",
    });
    expect(JSON.stringify(projection.attestations[0]))
      .toContain("2026-09-20T23:59:59.123456Z");
  });
});

type Candidate = ReturnType<typeof candidate>;

const setup = (candidates: readonly Candidate[],
  presentation: PromotionPresentationBuilder,
  supplementalEvidence: ReaderSummarySupplementalEvidenceSelectorPort =
    new TestSupplementalEvidenceSelector([])) => {
  const assessments = candidates.map((value) => assessment(value));
  const store: Pick<ReaderValueAssessmentStore, "read"> = {
    read: async (_scope, _interest, references) => references.map((reference) => {
      const found = assessments.find((value) => value.id === reference.assessmentId)!;
      return { status: "available" as const, assessment: found };
    }),
  };
  const period = { cadence: "daily" as const,
    startedAt: new Date("2026-09-20T00:00:00.000Z"),
    endedAt: new Date("2026-09-21T00:00:00.000Z"), timezone: "UTC",
    periodKey: "daily:2026-09-20T00:00:00.000Z:2026-09-21T00:00:00.000Z:UTC" };
  const job = ReaderSummaryJob.request({ id: id(900),
    tenantId: tenantId(id(901)), workspaceId: workspaceId(id(902)),
    scope: { type: "interest", interestId: id(903) }, period,
    idempotencyKey: "v3-promotion-test", requestedAt: period.endedAt,
    selectionStrategy: "legacy_v2" }).start({ startedAt: period.endedAt });
  const manifest: ReaderSummaryPreparationManifest = {
    schemaVersion: "reader_summary_preparation_manifest.v1",
    cutoffAt: "2026-09-21T00:00:00.000000Z", interestSha256: "1".repeat(64),
    rubricSha256: "2".repeat(64), inputBuilderVersion: "input.v1",
    modelConfigVersion: "model.v1", candidates: candidates.map((value) => ({
      candidateId: value.id, sourceBindingId: value.sourceBindingId,
      providerKey: value.provider, sourceItemId: value.sourceItemId,
      sourceRevisionKey: `revision-${value.id}`,
      sourceSnapshotSha256: value.sourceSnapshotSha256,
      assessmentId: value.assessmentId, inputSha256: value.inputSha256,
      publishedAt: value.publishedAt, observedAt: value.observedAt,
      sourceKind: "article", canonicalIdentity: value.canonicalIdentity,
      storyId: value.storyId,
    })) };
  return { subject: new RelevanceReaderSummaryV3Promotion(
    store, presentation, supplementalEvidence),
    job, manifest };
};

class TestSupplementalEvidenceSelector implements
ReaderSummarySupplementalEvidenceSelectorPort {
  readonly calls: Parameters<ReaderSummarySupplementalEvidenceSelectorPort[
    "selectSupplemental"
  ]>[0][] = [];

  constructor(private readonly evidence: readonly SummaryEvidenceItem[]) {}

  async selectSupplemental(
    params: Parameters<ReaderSummarySupplementalEvidenceSelectorPort[
      "selectSupplemental"
    ]>[0],
  ): Promise<readonly SummaryEvidenceItem[]> {
    this.calls.push(params);
    return this.evidence;
  }
}

class TestPresentation implements PromotionPresentationBuilder {
  attempted = 0;
  readonly batches: string[][] = [];
  constructor(private readonly unavailable = new Set<string>()) {}
  async build(inputs: readonly ReaderPostPresentationV3Input[]) {
    this.attempted += inputs.length;
    this.batches.push(inputs.map((input) => input.candidateId));
    return inputs.map((input) => {
      if (this.unavailable.has(input.candidateId)) {
        return { status: "unavailable" as const,
          reason: "insufficient_support" as const };
      }
      return sealReaderPostPresentationV3({ input, headline: {
        status: "accepted", kind: "claim", text: `Useful method ${input.candidateId.slice(-2)}`,
        binding: { candidateId: input.candidateId, providerKey: input.providerKey,
          tenantId: input.tenantId, workspaceId: input.workspaceId,
          interestId: input.interestId, sourceBindingId: input.sourceBindingId,
          sourceItemId: input.sourceItemId, trustedIntent: input.trustedIntent,
          availability: "body_present", reviewedInputDigest: promotionPayloadDigest(
            JSON.stringify({ candidateId: input.candidateId,
              providerKey: input.providerKey, context: { tenantId: input.tenantId,
                workspaceId: input.workspaceId, interestId: input.interestId,
                sourceBindingId: input.sourceBindingId,
                sourceItemId: input.sourceItemId,
                trustedIntent: input.trustedIntent, availability: "body_present" },
              title: input.title, body: input.body })) },
        support: [{ field: "bodyPreview", start: 0, end: 12,
          quote: input.body.slice(0, 12) }], qualifications: [], confidence: 0.9,
        wholeInput: { titleLength: input.title.length, bodyLength: input.body.length,
          qualificationJudgment: "none" },
      } });
    });
  }
}

const candidate = (ordinal: number,
  usefulness: ReaderValueAnswers["usefulness"]["choice"],
  relevance: ReaderValueAnswers["relevance"]["choice"],
  storyId: string | undefined = `story-${ordinal}`) => ({ id: id(ordinal), assessmentId: id(ordinal + 100),
  sourceItemId: id(ordinal + 200), sourceBindingId: id(ordinal + 300),
  provider: ordinal % 2 === 0 ? "reddit" : "rss",
  canonicalIdentity: `https://example.test/${ordinal}`,
  ...(storyId === undefined ? {} : { storyId }),
  publishedAt: `2026-09-20T00:00:${String(ordinal).padStart(2, "0")}.000001Z`,
  observedAt: `2026-09-20T00:01:${String(ordinal).padStart(2, "0")}.000001Z`,
  sourceSnapshotSha256: ordinal.toString(16).padStart(64, "0"),
  inputSha256: (ordinal + 1).toString(16).padStart(64, "0"),
  assessedAt: "2026-09-20T00:10:00.000001Z",
  title: `Title ${id(ordinal)}`,
  body: "Useful body text with exact evidence.",
  usefulness, relevance });

const assessment = (value: Candidate): ReaderValueAssessment => ({
  id: value.assessmentId, state: "assessed", attempts: 1, leaseToken: null,
  leaseUntil: null, assessedAt: value.assessedAt,
  answers: answers(value.usefulness, value.relevance), usageUnknown: false,
  costUsd: 0.001, errorCode: null,
  input: { tenantId: id(901), workspaceId: id(902), interestId: id(903),
    sourceItemId: value.sourceItemId, sourceRevisionKey: "revision",
    sourceSnapshotSha256: value.sourceSnapshotSha256,
    interestSha256: "1".repeat(64), rubricVersion: "reader-value.v1",
    rubricSha256: "2".repeat(64), inputBuilderVersion: "input.v1",
    modelConfigVersion: "model.v1", inputSha256: value.inputSha256,
    requestSha256: "3".repeat(64), requestedModel: "jev", requestBody: "{}",
    snapshot: { sourceSnapshotSha256: value.sourceSnapshotSha256,
      interestSha256: "1".repeat(64), sanitizedTextSha256: "4".repeat(64),
      title: value.title, body: value.body,
      interest: "testing", capture: { representationVersion: "capture.v1",
        availability: "complete", segments: [] },
      availableAt: "2026-09-20T00:00:00.000001Z",
      originalTitleLength: 42, originalBodyLength: value.body.length,
      retainedSnapshotTruncated: false, safety: "allowed" } },
});

const answers = (usefulness: ReaderValueAnswers["usefulness"]["choice"],
  relevance: ReaderValueAnswers["relevance"]["choice"]): ReaderValueAnswers => ({
  usefulness: answer("usefulness", usefulness), relevance: answer("relevance", relevance),
  context_sufficiency: answer("context_sufficiency", "sufficient"),
  evidence_basis: answer("evidence_basis", "observation"),
});

const labels = { usefulness: ["noise", "context", "useful", "important", "insufficient_context"],
  relevance: ["unrelated", "adjacent", "relevant", "central", "insufficient_context"],
  context_sufficiency: ["insufficient", "partial", "sufficient"],
  evidence_basis: ["observation", "described_data", "linked_claim", "unsupported_claim", "no_claim", "insufficient_context"] } as const;
const answer = <K extends ReaderValueCriterion>(criterion: K,
  choice: ReaderValueAnswers[K]["choice"]): ReaderValueAnswers[K] => {
  const values = labels[criterion] as readonly string[];
  return { choice, probabilities: Object.fromEntries(values.map((value) =>
    [value, value === choice ? 1 : 0])), confidence: 0.9,
  choiceDiffersFromArgmax: false, probabilityTie: false } as ReaderValueAnswers[K];
};

const id = (ordinal: number): string =>
  `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;

const githubEvidence = (rank: number): SummaryEvidenceItem => ({
  feedItemId: id(500 + rank), sourceItemId: `github-source-${rank}`,
  sourceBindingId: "github-binding", interestId: id(903),
  providerKey: "github-trending-page", providerName: "GitHub Trending",
  canonicalUrl: `https://github.com/example/repository-${rank}`,
  title: `Repository ${rank}`, bodyPreview: `Trending repository ${rank}`,
  publishedAt: new Date("2026-09-20T18:00:00.000Z"),
  observedAt: new Date("2026-09-20T18:05:00.000Z"),
  score: 1, whyImportant: ["Eligible frozen GitHub projection"],
  providerMetricLabels: [{ label: "GitHub Trending Today",
    value: `#${rank} · +${2_000 - rank} stars today` }],
  readerActionKind: "watch_repository",
});
