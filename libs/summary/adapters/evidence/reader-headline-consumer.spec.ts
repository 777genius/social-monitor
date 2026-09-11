import { readerPostDisplayHeadline, capturedReaderSource, isConciseDisplayText } from "../../domain/services/reader-post-display-headline";
import { readerDisplayPublicationFindings } from "../../domain/policies/reader-summary-display-publication";
import { readerSummaryArtifact } from "../persistence/prisma/prisma-reader-summary-artifact-fixture.spec-support";
import { buildTopReadTitle } from "../../domain/services/reader-summary-top-read-title";
import { assessedSource, headlineScope, withAssessment } from "./reader-headline.spec-support";
import { project } from "./reader-summary-faithful-source.spec-support";
import { selection, storyCluster } from "./reader-summary-editorial-slate.spec-support";
import { isReaderFacingQualityTopRead } from "../../domain/policies/rendered-top-read-selection-policy";

describe("summary candidate-bound display headline consumer", () => {
  it("projects accepted text independently of full capture and preserves all ranking/selection material", () => {
    const lead = assessedSource();
    const accepted = project([lead]);
    const unavailable = project([{ ...lead, readerHeadline: { status: "unavailable", reasonCode: "not_assessed" } }]);
    expect(accepted.topReads[0]?.title).toBe(lead.readerHeadline?.status === "accepted" ? lead.readerHeadline.text : "invalid");
    expect(accepted.topReads[0]?.capturedSource).toEqual(capturedReaderSource(lead));
    const stripDisplay = (value: object) => {
      const { title, displayHeadline, capturedSource: capture, canonicalPayload, digest, ...rest } = value as Record<string, unknown>;
      void title; void displayHeadline; void capture; void canonicalPayload; void digest;
      return rest;
    };
    expect(accepted.topReads.map(stripDisplay)).toEqual(unavailable.topReads.map(stripDisplay));
    expect(accepted.attestations.map(stripDisplay)).toEqual(unavailable.attestations.map(stripDisplay));
    expect(accepted.attestedEvidenceFacts).toEqual(unavailable.attestedEvidenceFacts);
    expect(accepted.admittedEvidence[0]?.sourceText).toBe(lead.sourceText);
    expect(buildTopReadTitle({ storyTitle: "Unrelated assertion", storySummary: "Unrelated assertion",
      primaryEvidence: lead, evidence: [] })).toBe(accepted.topReads[0]?.title);
    expect(isReaderFacingQualityTopRead({ ...accepted.topReads[0]!, signalScore: 2.2,
      reason: "Operators can use these findings to evaluate the benchmark methodology." }, [lead])).toBe(true);
  });

  it.each(["candidateId", "sourceItemId", "sourceBindingId", "providerKey", "interestId", "tenantId", "workspaceId", "reviewedInputDigest"])(
    "rejects a copied or stale %s", (key) => {
      const lead = assessedSource();
      if (lead.readerHeadline?.status !== "accepted") throw new Error("fixture");
      const invalid = { ...lead, readerHeadline: { ...lead.readerHeadline,
        binding: { ...lead.readerHeadline.binding, [key]: "wrong" } } };
      expect(readerPostDisplayHeadline(invalid, headlineScope).status).toBe("unavailable");
      expect(project([invalid]).topReads).toHaveLength(1);
    },
  );

  it.each([undefined, "", "preview changed", "Orion findings.\nLate retraction."])(
    "never substitutes a preview for absent or changed captured source: %s", (sourceText) => {
      const lead = { ...assessedSource(), sourceText };
      expect(readerPostDisplayHeadline(lead).status).toBe("unavailable");
      expect(project([lead]).topReads[0]?.capturedSource?.body).toBe(sourceText);
    },
  );

  it.each(["Orion launch was not confirmed.", "The allegation is unproven.",
    "Correction: this measured students, not workers.", "Only an author anecdote, not independent confirmation.",
    "Quoted claim is false; no release occurred.", "Entire claim retracted."])(
    "keeps late qualification reachable with a nonassertive subject label: %s", (tail) => {
      const lead = assessedSource(`Orion benchmark report. ${"Context. ".repeat(80)}${tail}`, "Orion benchmark discussion");
      if (lead.readerHeadline?.status !== "accepted") throw new Error("fixture");
      const safe = { ...lead, readerHeadline: { ...lead.readerHeadline, kind: "subject_label" as const,
        support: [{ field: "title" as const, start: 0, end: 5, quote: "Orion" },
          { field: "title" as const, start: 6, end: 15, quote: "benchmark" }],
        wholeInput: { ...lead.readerHeadline.wholeInput, qualificationJudgment: "subject_only" as const } } };
      const top = project([safe]).topReads[0]!;
      expect(top.title).toBe("Orion benchmark discussion");
      expect(top.displayHeadline?.status).toBe("accepted");
      expect(top.capturedSource?.body).toBe(lead.sourceText);
      expect(top.capturedSource?.body?.endsWith(tail)).toBe(true);
    },
  );

  it.each([12001, 256001])("rejects incomplete review at %i units and retains available source", (length) => {
    const lead = assessedSource("x".repeat(length) + " Retraction.", "Orion benchmark discussion");
    const top = project([lead]).topReads[0]!;
    expect(top.displayHeadline?.status).toBe("unavailable");
    expect(top.capturedSource?.body).toBe(lead.sourceText);
  });

  it.each(["a".repeat(120), "Orion\nbenchmark", "Orion…", "https://example.test", "Check this out!",
    "Orion\u0000benchmark", "Orion\ud800benchmark", "Orion\u202ebenchmark"])("rejects without clipping: %s", (text) => {
    expect(readerPostDisplayHeadline(assessedSource("Orion benchmark report.", text)).status).toBe("unavailable");
  });

  it("honors 119 UTF-16 units, astral and combining characters, CJK and title-only captures", () => {
    expect(isConciseDisplayText("a".repeat(119))).toBe(true);
    for (const text of ["Orion 🚀 cafe\u0301 研究。", "Orion benchmark discussion"]) {
      const lead = withAssessment({ ...assessedSource(), title: text, sourceText: "" }, text);
      expect(readerPostDisplayHeadline(lead).status).toBe("accepted");
      expect(capturedReaderSource(lead).body).toBe("");
    }
  });

  it("rejects publication for missing annotations without dropping, refilling or demoting selected cards", () => {
    const lead = { ...assessedSource(), readerHeadline: undefined };
    const projection = project([lead]);
    const fixture = readerSummaryArtifact("faithful-source-fixture").toSnapshot();
    const input = selection([lead], [storyCluster(lead.feedItemId, [lead])]);
    const snapshot = { ...fixture, promotionAttestations: projection.attestations,
      content: { ...fixture.content!, topReads: projection.topReads, selectedPosts: projection.additionalPosts } };
    expect(readerDisplayPublicationFindings(snapshot, input)).toEqual([{ code: "editorial_quality",
      reason: "Selected reader headline is unavailable or its source identity is invalid." }]);
    expect(snapshot.content.topReads.map((card) => card.promotionCandidateId)).toEqual([lead.feedItemId]);
    expect(snapshot.content.topReads[0]?.capturedSource?.body).toBe(lead.sourceText);
  });
});
