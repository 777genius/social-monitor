import { activeReaderSummaryPurposes } from "@social-monitor/summary/adapters/model/active-reader-summary-generation-profile";
import { FixedClock } from "@social-monitor/shared-kernel";
import { sourceContentAssessmentPurpose as purpose } from "./reader-summary-new-input-refresh-assessment-runtime";
import { createRefreshAssessmentReviewer } from "./reader-summary-new-input-refresh-assessment";
import type { guardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";
import { selectorOutput, selectorWiring } from "./reader-summary-new-input-refresh-selector-composition.spec-support";
import { publicationProbe } from "./reader-summary-new-input-refresh-model-composition.spec-support";
import { refreshNow } from "./reader-summary-new-input-refresh.spec-support";

afterEach(() => jest.restoreAllMocks());

describe("historical unpaid preflight to guarded pool assessment to canonical selection", () => {
  it("finds unassessed social input, spends once and binds selected evidence to intent", async () => {
    const test = await selectorWiring();
    expect(test.preflight).toEqual({ assessmentCandidateCount: 2 });
    expect(test.commands).toEqual([]);
    const selection = await test.selectComplete();
    expect(selection.selectedEvidence.map((e) => e.feedItemId).sort()).toEqual(["synthetic-reddit", "synthetic-x"]);
    expect(selection.selectedEvidence.every((e) => e.contentQuality?.reason === "promotion_assessment:promote")).toBe(true);
    test.assessment.assertComplete(test.preflight.assessmentCandidateCount);
    const calls = test.commands.filter((c) => c.purpose === purpose);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!.prompt).candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ candidateId: "synthetic-x", trustedIntent: "AI developer tools" }),
      expect.objectContaining({ candidateId: "synthetic-reddit", trustedIntent: "AI developer tools" }),
    ]));
    expect(test.events).toContainEqual(expect.objectContaining({ status: "invocation_consumed", purpose,
      assessmentAttempts: 1, assessmentCandidates: 2, assessmentBytes: Buffer.byteLength(calls[0]!.prompt) }));
    const publication = publicationProbe(test.runtime);
    await publication.attempt();
    expect(publication.publish).toHaveBeenCalledTimes(1);
    // Reconstructing a reviewer does not buy another runtime attempt.
    await test.select();
    expect(test.commands.filter((c) => c.purpose === purpose)).toHaveLength(1);
    expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
  });

  it.each(["missing", "wrong binding", "wrong quote", "duplicate", "low confidence", "needs context"])(
    "keeps %s assessment pending and prevents publication and subsequent spend", async (kind) => {
      const test = await selectorWiring({ output: (command) => {
        const output = selectorOutput(command);
        if (command.purpose !== purpose) return output;
        const reviews = output.reviews as Record<string, unknown>[];
        switch (kind) {
          case "missing": return { reviews: [] };
          case "wrong binding": reviews[0]!.bindingId = "wrong"; break;
          case "wrong quote": reviews[0]!.evidence = [{ field: "title", start: 0, end: 5, quote: "wrong" }]; break;
          case "duplicate": return { reviews: [reviews[0], reviews[0]] };
          case "low confidence": reviews[0]!.confidence = 0.1; break;
          case "needs context": reviews[0]!.decision = "needs_context"; break;
        }
        return output;
      } });
      expect(test.preflight.assessmentCandidateCount).toBe(2);
      await expect(test.selectComplete()).rejects.toThrow(/reconciliation/u);
      expect(() => test.assessment.assertComplete(2)).toThrow(/reconciliation/u);
      expect(test.commands.map((c) => c.purpose)).toEqual([purpose]);
      const publication = publicationProbe(test.runtime);
      await expect(publication.attempt()).rejects.toThrow(/reconciliation/u);
      expect(publication.publish).not.toHaveBeenCalled();
      await test.select();
      expect(test.commands).toHaveLength(1);
    },
  );

  it("accepts an assessed rejection as a decision, without promoting its evidence", async () => {
    const test = await selectorWiring({ output: (command) => {
      const output = selectorOutput(command);
      if (command.purpose === purpose) {
        for (const review of output.reviews as Record<string, unknown>[]) review.decision = "reject";
      }
      return output;
    } });
    expect((await test.select()).selectedEvidence).toEqual([]);
    test.assessment.assertComplete(2);
    expect(() => test.runtime.assertUsable()).not.toThrow();
    expect(test.commands.map((c) => c.purpose)).toEqual([purpose, activeReaderSummaryPurposes.storyRelations]);
  });

  it("blocks unreviewed candidates left by an exhausted application budget", async () => {
    const test = await selectorWiring({ extraCandidates: 199 });
    expect(test.preflight.assessmentCandidateCount).toBe(201);
    await expect(test.selectComplete()).rejects.toThrow(/reconciliation/u);
    expect(test.commands.filter((c) => c.purpose === purpose)).toHaveLength(25);
    expect(() => test.assessment.assertComplete(test.preflight.assessmentCandidateCount)).toThrow(/reconciliation/u);
    await expect(publicationProbe(test.runtime).attempt()).rejects.toThrow(/reconciliation/u);
  });

  it.each(["disabled", "openai-responses"])("cannot route %s outside the guarded pool", (mode) => {
    const runtime = {} as ReturnType<typeof guardedRefreshRuntime>;
    expect(() => createRefreshAssessmentReviewer({ env: { RELEVANCE_CONTENT_QUALITY_REVIEWER: mode },
      clock: new FixedClock(refreshNow), runtime })).toThrow(/guarded subscription/u);
  });
});
