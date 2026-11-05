import { isHistoricalPromotionStaleSourcePreserved } from
  "./reader-summary-promotion-v2-historical-stale-source";

describe("historical promotion stale source reconciliation", () => {
  const candidate = {
    sourcePublicationId: "00000000-0000-4000-8000-000000000001",
    active: {
      publicationId: "00000000-0000-4000-8000-000000000001",
      requestedAt: "2026-09-05T20:22:40.527Z",
      modelAuthority: 3,
    },
    job: {
      artifactId: null,
      failureReason:
        "Reader summary publication was rejected as a stale generation",
      requestedAt: "2026-09-13T18:54:53.456Z",
    },
  } as const;

  it("accepts only a newer lower-authority stale attempt with the source unchanged", () => {
    expect(isHistoricalPromotionStaleSourcePreserved(candidate)).toBe(true);

    expect(isHistoricalPromotionStaleSourcePreserved({
      ...candidate,
      active: { ...candidate.active, publicationId: "different" },
    })).toBe(false);
    expect(isHistoricalPromotionStaleSourcePreserved({
      ...candidate,
      active: { ...candidate.active, modelAuthority: 2 },
    })).toBe(false);
    expect(isHistoricalPromotionStaleSourcePreserved({
      ...candidate,
      job: { ...candidate.job, requestedAt: candidate.active.requestedAt },
    })).toBe(false);
    expect(isHistoricalPromotionStaleSourcePreserved({
      ...candidate,
      job: { ...candidate.job, failureReason: "provider failed" },
    })).toBe(false);
  });
});
