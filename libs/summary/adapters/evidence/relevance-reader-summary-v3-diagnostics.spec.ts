import { candidate, githubEvidence, id, setup, TestPresentation, TestSupplementalEvidenceSelector } from
  "./relevance-reader-summary-v3-promotion.fixture";
import { readReaderPromotionDiagnostics } from
  "../../domain/value-objects/reader-promotion-diagnostics";
import { artifact } from
  "../../domain/policies/reader-summary-publication-policy-test-fixtures";
import { serializeReaderSummaryArtifact } from
  "../persistence/prisma/prisma-reader-summary-json";
import { normalizeReaderSummaryArtifactPayload } from
  "../persistence/prisma/prisma-reader-summary-artifact-payload";
import { headlineFallback } from
  "../persistence/prisma/reader-headline-artifact.spec-support";
import { ReaderSummaryArtifact } from "../../domain";

describe("normalized V3 promotion exclusion provenance", () => {
  it("distinguishes semantic rejection from failed presentation and persists it", async () => {
    const failed = candidate(1, "useful", "central");
    const selected = candidate(2, "useful", "central");
    const context = candidate(3, "context", "central");
    const presentation = new TestPresentation(new Set([failed.id]));
    const fixture = setup([failed, selected, context], { build: async (inputs) =>
      (await presentation.build(inputs)).map((result) => result.status === "unavailable"
        ? { status: "unavailable" as const, reason: "invalid_presentation" as const,
          validation: { stage: "headline_seal" as const, code: "source_reference" as const } }
        : result) });
    const result = await fixture.subject.build({ job: fixture.job, manifest: fixture.manifest });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("Fixture did not publish");
    const diagnostics = result.evidence.promotionV3?.diagnostics;
    expect(diagnostics?.candidates).toEqual([
      { candidateId: failed.id, assessmentId: failed.assessmentId,
        selectionReason: "presentation_unavailable", presentationStatus: "unavailable",
        presentationAttempted: true, presentationReason: "invalid_presentation",
        presentationValidation: { stage: "headline_seal", code: "source_reference" } },
      { candidateId: selected.id, assessmentId: selected.assessmentId,
        selectionReason: "selected_top", presentationStatus: "available", presentationAttempted: true },
      { candidateId: context.id, assessmentId: context.assessmentId,
        selectionReason: "semantic_not_admitted", presentationStatus: "pending", presentationAttempted: false },
    ]);
    const value = artifact({ promotionDiagnostics: diagnostics });
    const payload = serializeReaderSummaryArtifact(value);
    const loaded = ReaderSummaryArtifact.rehydrate(
      normalizeReaderSummaryArtifactPayload(payload, headlineFallback(value)));
    expect(loaded.toSnapshot().promotionDiagnostics).toEqual(diagnostics);
    const detached = loaded.toSnapshot().promotionDiagnostics!;
    (detached.candidates as unknown[]).length = 0;
    expect(loaded.toSnapshot().promotionDiagnostics?.candidates).toHaveLength(3);
    const malformed = { ...payload, promotionDiagnostics: { ...diagnostics,
      rawProviderMessage: "unexpected" } };
    expect(normalizeReaderSummaryArtifactPayload(malformed, headlineFallback(value))
      .promotionDiagnostics).toBeUndefined();
    expect(() => artifact({ promotionDiagnostics: malformed.promotionDiagnostics as never }))
      .toThrow("promotion diagnostics are invalid");
  });

  it("keeps no-signal and supplemental-only paths valid with no admitted post", async () => {
    const context = candidate(3, "context", "central");
    const empty = setup([context], new TestPresentation());
    await expect(empty.subject.build({ job: empty.job, manifest: empty.manifest }))
      .resolves.toEqual({ kind: "no_signal" });
    const supplemental = setup([context], new TestPresentation(),
      new TestSupplementalEvidenceSelector([githubEvidence(1)]));
    const result = await supplemental.subject.build({ job: supplemental.job,
      manifest: supplemental.manifest });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("Fixture did not publish supplemental evidence");
    expect(result.evidence.promotionV3?.diagnostics?.candidates).toEqual([
      expect.objectContaining({ candidateId: context.id,
        selectionReason: "semantic_not_admitted", presentationAttempted: false }),
    ]);
    expect(result.evidence.selectedEvidence.map((item) => item.providerKey))
      .toEqual(["github-trending-page"]);
  });

  it("rejects arbitrary provider messages and duplicate candidate IDs", () => {
    const row = { candidateId: id(1), assessmentId: id(101),
      selectionReason: "presentation_unavailable", presentationStatus: "unavailable",
      presentationAttempted: true, presentationReason: "invalid_presentation" };
    const wrap = (candidates: readonly unknown[]) => ({ schemaVersion: "reader_promotion_diagnostics.v1", candidates });
    expect(readReaderPromotionDiagnostics(wrap([row]))?.candidates).toHaveLength(1);
    const detailed = { ...row, presentationValidation: {
      stage: "headline_seal", code: "source_reference" } };
    expect(readReaderPromotionDiagnostics(wrap([detailed]))?.candidates[0])
      .toEqual(detailed);
    for (const invalid of [{ stage: "headline_seal", code: "provider message" },
      { stage: "unknown", code: "source_reference" },
      { stage: "headline_seal", code: "source_reference", rawText: "unexpected" }]) {
      expect(readReaderPromotionDiagnostics(wrap([{ ...row,
        presentationValidation: invalid }]))).toBeUndefined();
    }
    expect(readReaderPromotionDiagnostics(wrap([row, row]))).toBeUndefined();
    expect(readReaderPromotionDiagnostics(wrap([{ ...row, rawMessage: "unexpected" }]))).toBeUndefined();
    expect(readReaderPromotionDiagnostics(wrap([{ ...row, presentationReason: "provider message" }]))).toBeUndefined();
  });
});
