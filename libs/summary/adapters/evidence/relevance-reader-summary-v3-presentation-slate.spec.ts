import type { PromotionPresentationBuilder } from
  "../../domain/services/reader-post-presentation-v3";
import { candidate, id, TestPresentation, workspaceSetup } from
  "./relevance-reader-summary-v3-promotion.fixture";

const distinct = (count: number) => Array.from({ length: count }, (_, index) => ({
  ...candidate(index + 1, index < 69 ? "important" : "useful", "central"),
  provider: index < 69 ? "x-twitter" : index < 75 ? "hacker-news" : "reddit",
  publishedAt: "2026-09-20T12:00:00.000001Z",
  observedAt: "2026-09-20T12:01:00.000001Z",
  title: `Independent event ${index}`,
  body: `Independent observed event ${index} with exact source evidence.`,
}));

describe("bounded workspace presentation slate", () => {
  it("selects 76 admitted stories including later HN and Reddit within 64 attempts", async () => {
    const presentation = new TestPresentation();
    const fixture = workspaceSetup(distinct(76), undefined, presentation);
    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });

    expect(result.kind).toBe("ready");
    expect(presentation.attempted).toBeLessThanOrEqual(64);
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.top.map((value) => value.candidateId))
      .toEqual([1, 2, 3, 4, 70, 71, 72, 73, 76].map(id));
    expect(result.evidence.promotionV3?.additional.map((value) => value.candidateId))
      .toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(id));
    expect(presentation.batches.flat()).toContain(id(76));
    expect(result.evidence.selectedEvidence).toHaveLength(21);
    expect(result.evidence.selectedEvidence.every((item) =>
      item.readerHeadline?.status === "accepted")).toBe(true);
  });

  const withRejectedPresentations = (rejected: Set<string>) => {
    const tracked = new TestPresentation(rejected);
    const presentation: PromotionPresentationBuilder = { build: async (inputs) =>
      (await tracked.build(inputs)).map((result) => result.status === "unavailable"
        ? { status: "unavailable", reason: "invalid_presentation" } : result) };
    return { tracked, presentation };
  };

  it("continues past rejected batches to twenty-one sealed stories without repeating bindings", async () => {
    const { tracked, presentation } = withRejectedPresentations(new Set([1, 2, 3, 4].map(id)));
    const fixture = workspaceSetup(distinct(76), undefined, presentation);
    const result = await fixture.subject.build({ job: fixture.job, manifest: fixture.manifest });
    expect(result.kind).toBe("ready");
    expect(tracked.attempted).toBeLessThanOrEqual(64);
    expect(new Set(tracked.batches.flat()).size).toBe(tracked.attempted);
    if (result.kind !== "ready") return;
    expect(result.evidence.selectedEvidence).toHaveLength(21);
    expect(result.evidence.selectedEvidence.every((item) => item.readerHeadline?.status === "accepted"))
      .toBe(true);
    for (const rejectedId of [id(1), id(2), id(3), id(4)]) {
      expect(result.evidence.selectedEvidence.map((item) => item.feedItemId))
        .not.toContain(rejectedId);
    }
  });

  it("publishes only genuinely sealed survivors when a small full inventory loses a rejected batch", async () => {
    const rejected = new Set([1, 2, 3, 4].map(id));
    const { tracked, presentation } = withRejectedPresentations(rejected);
    const fixture = workspaceSetup(distinct(10), undefined, presentation);
    const result = await fixture.subject.build({ job: fixture.job, manifest: fixture.manifest });
    expect(result.kind).toBe("ready");
    expect(tracked.attempted).toBe(10);
    expect(new Set(tracked.batches.flat()).size).toBe(10);
    if (result.kind !== "ready") return;
    expect(result.evidence.selectedEvidence).toHaveLength(6);
    for (const item of result.evidence.selectedEvidence) {
      expect(rejected.has(item.feedItemId)).toBe(false);
      expect(item.readerHeadline?.status).toBe("accepted");
    }
  });

  it("retains ordinary small workspace slates without invalid presentations", async () => {
    const fixture = workspaceSetup(distinct(8));
    const result = await fixture.subject.build({ job: fixture.job, manifest: fixture.manifest });
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") expect(result.evidence.selectedEvidence).toHaveLength(8);
  });

  it("keeps the sixty-four attempt ceiling when every presentation is rejected", async () => {
    const { tracked, presentation } = withRejectedPresentations(new Set(distinct(76).map((row) => row.id)));
    const fixture = workspaceSetup(distinct(76), undefined, presentation);
    await expect(fixture.subject.build({ job: fixture.job, manifest: fixture.manifest }))
      .resolves.toEqual({ kind: "budget_exhausted" });
    expect(tracked.attempted).toBe(64);
    expect(new Set(tracked.batches.flat()).size).toBe(64);
  });

  it("retains a finite comparison ceiling before presentation", async () => {
    const presentation = new TestPresentation();
    // 5,001 distinct admitted stories exceed the finite 5,000 relation-candidate ceiling.
    const fixture = workspaceSetup(distinct(5_001), undefined, presentation);
    await expect(fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest })).resolves.toEqual({ kind: "budget_exhausted" });
    expect(presentation.attempted).toBe(0);
  });

  it("replans a failed lead to the next representative without duplicating a ready story", async () => {
    const rows = distinct(76);
    rows[1] = { ...rows[1]!, storyId: rows[0]!.storyId,
      sourceItemId: rows[0]!.sourceItemId };
    const presentation = new TestPresentation(new Set([id(1)]));
    const fixture = workspaceSetup(rows, undefined, presentation);
    const result = await fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest });
    expect(result.kind).toBe("ready");
    expect(presentation.attempted).toBeLessThanOrEqual(64);
    expect(presentation.batches.flat().filter((value) => value === id(2)))
      .toHaveLength(1);
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.top[0]?.candidateId).toBe(id(2));
    expect(result.evidence.selectedEvidence.map((item) => item.feedItemId))
      .not.toContain(id(1));
  });

  it("refuses an unresolved better slate when 64 real attempts have failed", async () => {
    const presentation = new TestPresentation(new Set(distinct(76).map((row) => row.id)));
    const fixture = workspaceSetup(distinct(76), undefined, presentation);
    await expect(fixture.subject.build({ job: fixture.job,
      manifest: fixture.manifest })).resolves.toEqual({ kind: "budget_exhausted" });
    expect(presentation.attempted).toBe(64);
  });
});
