import { buildReaderPostPromotionProjection } from
  "../../domain/services/reader-post-promotion-projection";
import { assertV3PromotionAttestation } from
  "../persistence/prisma/prisma-reader-summary-promotion-v3-schema";
import { candidate, githubEvidence, id, setup, TestPresentation,
  TestSupplementalEvidenceSelector, workspaceSetup } from
  "./relevance-reader-summary-v3-promotion.fixture";

describe("RelevanceReaderSummaryV3Promotion", () => {
  // Regression: a workspace must pool disjoint interest assessments before
  // selecting one global Top, with each assessment read in its own scope.
  it("pools disjoint frozen interests into one globally ordered Top", async () => {
    const first = candidate(1, "useful", "relevant");
    const second = candidate(2, "important", "central");
    const fixture = workspaceSetup([first, second]);
    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.top.map((value) => value.candidateId))
      .toEqual([second.id, first.id]);
    expect(fixture.readInterests).toEqual([id(903), id(904)]);
    expect(result.evidence.selectedEvidence.map((value) => value.interestId))
      .toEqual([id(904), id(903)]);
  });

  it("consolidates 22 overlapping interests before charging story comparisons", async () => {
    const candidates = Array.from({ length: 88 }, (_, index) => {
      const story = Math.floor(index / 22);
      const base = candidate(index + 1,
        index === 21 ? "important" : "useful", "central", `shared-${story}`);
      return { ...base, sourceItemId: id(200 + story),
        canonicalIdentity: `https://example.test/shared-${story}`,
        provider: story % 2 === 0 ? "rss" : "reddit",
        publishedAt: "2026-09-20T12:00:00.000001Z",
        observedAt: "2026-09-20T12:01:00.000001Z" };
    });
    const presentation = new TestPresentation();
    const fixture = workspaceSetup(candidates, undefined, presentation, 22);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(fixture.readInterests).toEqual(Array.from({ length: 22 },
      (_, index) => id(903 + index)));
    expect(presentation.attempted).toBe(4);
    expect(result.evidence.promotionV3?.top.map((value) => value.candidateId))
      .toEqual([id(22), id(23), id(45), id(67)]);
    expect(result.evidence.promotionV3?.top[0]).toMatchObject({
      assessmentId: id(122), answers: { usefulness: { choice: "important" } },
    });
    expect(result.evidence.promotionV3?.excluded.filter((value) =>
      value.reason === "story_representative")).toHaveLength(84);
    expect(result.evidence.clusters).toHaveLength(4);
    for (const cluster of result.evidence.clusters) {
      expect(cluster.duplicateFeedItemIds).toHaveLength(21);
      expect(cluster.interestIds).toEqual(Array.from({ length: 22 },
        (_, index) => id(903 + index)));
    }
  });

  // Regression: a useful, relevant source with no citation identity is still
  // signal; it cannot be published as no signal when no card can present it.
  it("fails an incomplete citation identity instead of returning no signal", async () => {
    const presentation = new TestPresentation();
    const fixture = workspaceSetup([{ ...candidate(1, "useful", "relevant"),
      canonicalIdentity: "" }], undefined, presentation);

    await expect(fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest })).resolves.toEqual({ kind: "presentation_unavailable" });
    expect(presentation.attempted).toBe(0);
  });

  // Regression: an overlapping interest can supply a complete citation for
  // the same source, so its selected representative should satisfy the story.
  it("uses the complete overlapping representative when one identity is missing", async () => {
    const first = { ...candidate(1, "important", "central", "shared-story"),
      canonicalIdentity: "" };
    const second = { ...candidate(2, "useful", "relevant", "shared-story"),
      sourceItemId: first.sourceItemId };
    const fixture = workspaceSetup([first, second]);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.top.map((item) => item.candidateId))
      .toEqual([second.id]);
    expect(result.evidence.clusters[0]?.interestIds).toEqual([id(903), id(904)]);
  });

  // Regression: promotion cannot narrate a workspace manifest from another
  // exact source cutoff even if its candidates and period key still match.
  it("rejects a workspace cutoff change before presentation", async () => {
    const presentation = new TestPresentation();
    const fixture = workspaceSetup([candidate(1, "useful", "relevant")],
      undefined, presentation);

    await expect(fixture.subject.build({ job: fixture.job,
      manifest: { ...fixture.manifest,
        cutoffAt: "2026-09-20T23:59:59.999999Z" } }))
      .resolves.toEqual({ kind: "dependency_failure",
        reason: "config_unavailable" });
    expect(presentation.attempted).toBe(0);
  });

  // Regression: an assessment row can change after readiness; promotion must
  // reject a different rubric or interest query before presentation starts.
  it.each(["rubric", "interest_hash"] as const)(
    "rejects a changed frozen %s at promotion", async (change) => {
    const presentation = new TestPresentation();
    const fixture = workspaceSetup([candidate(1, "useful", "relevant")],
      change, presentation);

    await expect(fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest })).resolves.toEqual({ kind: "dependency_failure",
      reason: "assessment_unavailable" });
    expect(presentation.attempted).toBe(0);
    });

  // Regression: each interest used to form its own shortlist. Workspace Top
  // and Additional must instead share one eight-slot cap and provider limit.
  it("applies one deterministic Top and Additional cap across both interests", async () => {
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      ...candidate(index + 1, "important", "central"),
      provider: index < 10 ? "rss" : "reddit",
    }));
    const fixture = workspaceSetup(candidates);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.top.map((value) => value.candidateId))
      .toEqual([20, 19, 18, 17, 16, 15, 10, 9].map(id));
    expect(result.evidence.promotionV3?.additional.map((value) => value.candidateId))
      .toEqual([14, 13, 12, 11, 8, 7, 6, 5].map(id));
    expect(result.evidence.promotionV3?.top.filter((value) =>
      value.providerKey === "reddit")).toHaveLength(6);
    expect(result.evidence.selectedEvidence).toHaveLength(16);
  });

  it("fails closed when an unpresented provider can change a full global Top", async () => {
    const candidates = Array.from({ length: 34 }, (_, index) => ({
      ...candidate(index + 1, index < 32 ? "important" : "useful", "central"),
      provider: index < 32 ? "rss" : "reddit",
    }));
    const presentation = new TestPresentation();
    const fixture = workspaceSetup(candidates, undefined, presentation);

    await expect(fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest })).resolves.toEqual({ kind: "budget_exhausted" });
    expect(presentation.attempted).toBe(32);
    expect(presentation.batches.flat()).not.toContain(id(33));
    expect(presentation.batches.flat()).not.toContain(id(34));
  });

  // Regression: a weekly workspace can contain thousands of assessed noise
  // rows. They must not consume the bounded pairwise story-relation budget or
  // prevent the few qualifying sources from reaching one global selection.
  it("selects qualifying sources from a 5001-candidate weekly inventory", async () => {
    const candidates = Array.from({ length: 5_001 }, (_, index) => ({
      ...candidate(index + 1, index < 2 ? "useful" : "noise", "relevant"),
      publishedAt: "2026-09-20T12:00:00.000001Z",
      observedAt: "2026-09-20T12:01:00.000001Z",
    }));
    const fixture = workspaceSetup(candidates);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.top.map((item) => item.candidateId))
      .toEqual([id(1), id(2)]);
  });

  // Regression: a large assessed noise cluster must fit the workspace budget
  // without quadratic copies while grouping references and story members.
  it("handles 10000 assessed noise candidates sharing one story", async () => {
    const candidates = Array.from({ length: 10_000 }, (_, index) => ({
      ...candidate(index + 1, "noise", "relevant", "shared-story"),
      publishedAt: "2026-09-20T12:00:00.000001Z",
      observedAt: "2026-09-20T12:01:00.000001Z",
    }));
    const presentation = new TestPresentation();
    const fixture = workspaceSetup(candidates, undefined, presentation);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("no_signal");
    expect(presentation.attempted).toBe(0);
  });

  // Regression: if more than 5000 qualifying candidates need pairwise story
  // relations, promotion must fail with an explicit budget outcome before
  // presentation instead of hanging or silently dropping candidate evidence.
  it("fails an over-budget qualifying workspace story inventory", async () => {
    const candidates = Array.from({ length: 5_001 }, (_, index) => ({
      ...candidate(index + 1, "useful", "relevant"),
      publishedAt: "2026-09-20T12:00:00.000001Z",
      observedAt: "2026-09-20T12:01:00.000001Z",
    }));
    const presentation = new TestPresentation();
    const fixture = workspaceSetup(candidates, undefined, presentation);

    await expect(fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest })).resolves.toEqual({ kind: "budget_exhausted" });
    expect(presentation.attempted).toBe(0);
  });

  it("applies the relation inventory cap after exact source consolidation", async () => {
    const candidates = Array.from({ length: 5_001 }, (_, index) => ({
      ...candidate(index + 1, "useful", "relevant", "one-shared-story"),
      sourceItemId: id(200), canonicalIdentity: "https://example.test/shared",
      publishedAt: "2026-09-20T12:00:00.000001Z",
      observedAt: "2026-09-20T12:01:00.000001Z",
    }));
    const presentation = new TestPresentation();
    const fixture = workspaceSetup(candidates, undefined, presentation);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(presentation.attempted).toBe(1);
    expect(result.evidence.clusters[0]?.duplicateFeedItemIds).toHaveLength(5_000);
  });

  it("fails before presentation when pairwise story work exceeds its budget", async () => {
    const candidates = Array.from({ length: 100 }, (_, index) => ({
      ...candidate(index + 1, "useful", "relevant"),
      publishedAt: "2026-09-20T12:00:00.000001Z",
      observedAt: "2026-09-20T12:01:00.000001Z",
      body: `Distinct source ${index} ${"details ".repeat(600)}`,
    }));
    const presentation = new TestPresentation();
    const fixture = workspaceSetup(candidates, undefined, presentation);

    await expect(fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest })).resolves.toEqual({ kind: "budget_exhausted" });
    expect(presentation.attempted).toBe(0);
  });

  // Regression: the same source can carry conflicting Jev answers. The
  // selected representative must retain the entire qualifying assessment.
  it("uses one qualifying assessment for an overlapping source", async () => {
    const first = candidate(1, "noise", "central", "shared-story");
    const second = { ...candidate(2, "useful", "relevant", "shared-story"),
      sourceItemId: first.sourceItemId };
    const fixture = workspaceSetup([first, second]);
    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.top).toMatchObject([{
      candidateId: second.id, assessmentId: second.assessmentId,
      answers: { usefulness: { choice: "useful" },
        relevance: { choice: "relevant" } },
    }]);
    expect(result.evidence.clusters[0]?.interestIds).toEqual([id(903), id(904)]);
    const lead = result.evidence.selectedEvidence[0]!;
    const projection = buildReaderPostPromotionProjection({
      evidence: result.evidence.selectedEvidence, clusters: result.evidence.clusters,
      sourceWindow: result.evidence.sourceWindow,
      promotionV3: result.evidence.promotionV3,
      citations: [{ citationId: "workspace-citation", feedItemId: lead.feedItemId,
        sourceItemId: lead.sourceItemId, providerKey: lead.providerKey,
        field: "bodyPreview", canonicalUrl: lead.canonicalUrl }],
      attestationBinding: { artifactId: id(997),
        sourceWindow: result.evidence.sourceWindow },
    });
    expect(projection.topReads[0]?.matchedInterestIds).toEqual([id(903), id(904)]);
  });

  // Regression: two interests can both qualify the same source with
  // conflicting Jev tuples. The globally stronger complete tuple wins,
  // while the selected story still attributes both interests.
  it("selects the stronger qualifying assessment for an overlapping source", async () => {
    const first = candidate(1, "useful", "central", "shared-story");
    const second = { ...candidate(2, "important", "relevant", "shared-story"),
      sourceItemId: first.sourceItemId };
    const fixture = workspaceSetup([first, second]);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.top).toMatchObject([{
      candidateId: second.id, assessmentId: second.assessmentId,
      answers: { usefulness: { choice: "important" },
        relevance: { choice: "relevant" } },
    }]);
    expect(result.evidence.clusters[0]?.interestIds).toEqual([id(903), id(904)]);
  });

  // Regression: revoked, late, or source-revision-mismatched assessments
  // cannot be promoted as a partial workspace summary or leak a raw exception.
  it.each(["revoked", "late", "revision"] as const)(
    "fails the whole pooled promotion when one interest is %s", async (failure) => {
      const fixture = workspaceSetup([candidate(1, "useful", "relevant"),
        candidate(2, "important", "central")], failure);
      await expect(fixture.subject.build({ job: fixture.job,
        manifest: fixture.manifest })).resolves.toEqual({
        kind: "dependency_failure", reason: failure === "late"
          ? "assessment_coverage_timeout" : "assessment_unavailable",
      });
    });

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

  // Regression: two FeedItems can share a Jev assessment while requiring
  // different candidate-bound presentation seals. A failed lead must not
  // poison the second FeedItem through presentation-attempt reuse.
  it("retries a distinct workspace FeedItem presentation after a shared assessment fails", async () => {
    const lead = candidate(3, "useful", "relevant", "shared-story");
    const fallback = { ...candidate(1, "useful", "relevant", "shared-story"),
      sourceItemId: lead.sourceItemId, assessmentId: lead.assessmentId,
      sourceSnapshotSha256: lead.sourceSnapshotSha256,
      inputSha256: lead.inputSha256, provider: lead.provider };
    const presentation = new TestPresentation(new Set([lead.id]));
    const fixture = workspaceSetup([lead, candidate(2, "noise", "unrelated"),
      fallback], undefined, presentation);

    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(presentation.batches).toEqual([[lead.id], [fallback.id]]);
    expect(result.evidence.promotionV3?.top.map((value) => value.candidateId))
      .toEqual([fallback.id]);
    expect(result.evidence.selectedEvidence[0]?.readerHeadline?.status)
      .toBe("accepted");
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

  it.each([
    ['direct', 'https://example.test/article?edition=2&access_token=synthetic-marker-only',
      'https://example.test/article?edition=2'],
    ['whitespace', '  https://example.test/article?edition=2&access_token=synthetic-marker-only',
      'https://example.test/article?edition=2'],
    ['redirect', `  https://www.google.com/url?q=${encodeURIComponent(
      'https://example.test/article?edition=2&access_token=synthetic-marker-only')}&sa=U`,
    `https://www.google.com/url?q=${encodeURIComponent(
      'https://example.test/article?edition=2')}&sa=U`],
    ['scheme without slashes', 'https:example.test/article?edition=2&access_token=synthetic-marker-only',
      'https://example.test/article?edition=2'],
    ['tab in scheme', 'hTTps:\t//example.test/article?edition=2&access_token=synthetic-marker-only',
      'https://example.test/article?edition=2'],
    ['leading NUL before redirect', `\u0000https://www.google.com/url?q=${encodeURIComponent(
      'https://example.test/article?edition=2&access_token=synthetic-marker-only')}&sa=U`,
    `https://www.google.com/url?q=${encodeURIComponent(
      'https://example.test/article?edition=2')}&sa=U`],
    ['encoded Google path', `https://www.google.com./%75rl?q=${encodeURIComponent(
      'https://example.test/article?edition=2&access_token=synthetic-marker-only')}&sa=U`,
    `https://www.google.com./%75rl?q=${encodeURIComponent(
      'https://example.test/article?edition=2')}&sa=U`],
    ['Facebook redirect', `https://l.facebook.com/l.php?u=${encodeURIComponent(
      'https://example.test/article?edition=2&access_token=synthetic-marker-only')}&lang=en`,
    `https://l.facebook.com/l.php?u=${encodeURIComponent(
      'https://example.test/article?edition=2')}&lang=en`],
    ['LinkedIn redirect', `https://www.linkedin.com/redir/redirect?url=${encodeURIComponent(
      'https://example.test/article?edition=2&access_token=synthetic-marker-only')}&lang=en`,
    `https://www.linkedin.com/redir/redirect?url=${encodeURIComponent(
      'https://example.test/article?edition=2')}&lang=en`],
  ])('sanitizes %s URLs through promotion and projection', async (_case, raw, safe) => {
    const marker = 'synthetic-marker-only';
    const fixture = setup([{ ...candidate(1, 'useful', 'central'),
      canonicalIdentity: raw,
    }], new TestPresentation());
    const result = await fixture.subject.build({ job: fixture.job, manifest: fixture.manifest });
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    const item = result.evidence.selectedEvidence[0]!;
    const projection = buildReaderPostPromotionProjection({
      evidence: result.evidence.selectedEvidence, clusters: result.evidence.clusters,
      sourceWindow: result.evidence.sourceWindow, promotionV3: result.evidence.promotionV3,
      citations: [{ citationId: 'citation-public', feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId, providerKey: item.providerKey,
        field: 'canonicalUrl', canonicalUrl: item.canonicalUrl }],
      attestationBinding: { artifactId: id(997), sourceWindow: result.evidence.sourceWindow },
    });
    expect(item.canonicalUrl).toBe(safe);
    expect(projection.topReads[0]?.canonicalUrl).toBe(safe);
    expect(projection.admittedCitations[0]?.canonicalUrl).toBe(safe);
    expect(projection.attestations[0]?.canonicalIdentity).toBe(safe);
    expect(JSON.stringify({ evidence: projection.admittedEvidence, cards: projection.topReads,
      citations: projection.admittedCitations, attestations: projection.attestations }))
      .not.toContain(marker);
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

  // Regression: a short Top cannot publish while unpresented qualifying
  // stories remain outside the explicit presentation attempt budget.
  it("fails an incomplete global presentation instead of publishing a short Top", async () => {
    const unavailable = new Set(Array.from({ length: 31 }, (_, index) => id(index + 2)));
    const fixture = workspaceSetup(Array.from({ length: 33 }, (_, index) =>
      candidate(index + 1, "useful", "relevant")),
    undefined, new TestPresentation(unavailable));

    await expect(fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest })).resolves.toEqual({ kind: "budget_exhausted" });
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
