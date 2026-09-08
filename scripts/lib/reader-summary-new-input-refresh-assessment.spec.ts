import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
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
    const publication = publicationProbe(test.runtime, selection);
    await publication.attempt();
    expect(publication.publish).toHaveBeenCalledTimes(1);
    // Reconstructing a reviewer does not buy another runtime attempt.
    await test.select();
    expect(test.commands.filter((c) => c.purpose === purpose)).toHaveLength(1);
    expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
  });

  it.each(["missing", "one missing", "wrong binding", "wrong quote", "duplicate"])(
    "keeps %s assessment pending and prevents publication and subsequent spend", async (kind) => {
      const test = await selectorWiring({ output: (command) => {
        const output = selectorOutput(command);
        if (command.purpose !== purpose) return output;
        const reviews = output.reviews as Record<string, unknown>[];
        switch (kind) {
          case "missing": return { reviews: [] };
          case "one missing": return { reviews: reviews.slice(1) };
          case "wrong binding": reviews[0]!.bindingId = "wrong"; break;
          case "wrong quote": reviews[0]!.evidence = [{ field: "title", start: 0, end: 5, quote: "wrong" }]; break;
          case "duplicate": return { reviews: [reviews[0], reviews[0]] };
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
    expect((await test.selectComplete()).selectedEvidence).toEqual([]);
    test.assessment.assertComplete(2);
    expect(() => test.runtime.assertUsable()).not.toThrow();
    expect(test.commands.map((c) => c.purpose)).toEqual([purpose, activeReaderSummaryPurposes.storyRelations]);
  });

  it.each(["promote", "needs context", "low confidence"])(
    "publishes bounded selected assessments with 201 candidates and %s", async (kind) => {
      const rank = jest.spyOn(RankFeedItemsUseCase.prototype, "execute");
      let abstainingId: string | undefined;
      const test = await selectorWiring({ extraCandidates: 199, output: (command) => {
        const output = selectorOutput(command);
        if (command.purpose === purpose && kind !== "promote" && abstainingId === undefined) {
          const review = (output.reviews as Record<string, unknown>[])[0]!;
          abstainingId = review.candidateId as string;
          if (kind === "needs context") review.decision = "needs_context";
          else review.confidence = 0.1;
        }
        return output;
      } });
      expect(test.preflight.assessmentCandidateCount).toBe(201);
      expect(test.commands).toEqual([]);
      const selection = await test.selectComplete();
      const calls = test.commands.filter((c) => c.purpose === purpose);
      expect(calls).toHaveLength(25);
      const reviewedIds = calls.flatMap((call) =>
        (JSON.parse(call.prompt).candidates as { candidateId: string }[]).map((c) => c.candidateId));
      expect(reviewedIds).toHaveLength(200);
      expect(new Set(reviewedIds).size).toBe(200);
      expect(selection.selectedEvidence.length).toBeGreaterThan(0);
      for (const item of selection.selectedEvidence) {
        expect(reviewedIds).toContain(item.feedItemId);
        expect(item.feedItemId).not.toBe(abstainingId);
        expect(item.contentQuality).toMatchObject({ reason: "promotion_assessment:promote",
          eligibleForSummary: true, needsLlmReview: false });
      }
      const ranked = await rank.mock.results[1]!.value;
      expect(ranked.ok).toBe(true);
      expect(ranked.value.items).toHaveLength(201);
      const pending = ranked.value.items.filter((item: { feedItemId: string }) => !reviewedIds.includes(item.feedItemId));
      expect(pending).toHaveLength(1);
      expect(pending[0].contentQuality).toMatchObject({ reason: "promotion_assessment_pending:budget_exhausted",
        decision: "needs_context", eligibleForSummary: false, needsLlmReview: true });
      if (abstainingId) expect(ranked.value.items.find((item: { feedItemId: string }) => item.feedItemId === abstainingId)
        .contentQuality).toMatchObject({ reason: `promotion_assessment_pending:${kind === "needs context" ? "needs_context" : "low_confidence"}`,
        eligibleForSummary: false, needsLlmReview: true });
      const publication = publicationProbe(test.runtime, selection);
      await publication.attempt();
      expect(publication.publish).toHaveBeenCalledTimes(1);
      const published = publication.publish.mock.calls[0]![0].artifact.toSnapshot();
      expect(published.selectedEvidence).toEqual(selection.selectedEvidence);
      expect(published.sourceWindow).toEqual(selection.sourceWindow);
      expect(publication.assertProtected).toHaveBeenCalledTimes(1);
      expect(publication.assertCurrent).toHaveBeenCalledTimes(1);
      expect(test.events.filter((e) => e.status === "requires_reconciliation")).toEqual([]);
    },
  );

  it.each(["needs_context", "low_confidence"])("keeps a timely %s abstention local", async (kind) => {
    let abstainingId: string | undefined;
    const test = await selectorWiring({ output: (command) => {
      const output = selectorOutput(command);
      if (command.purpose === purpose) {
        const review = (output.reviews as Record<string, unknown>[])[0]!;
        abstainingId = review.candidateId as string;
        if (kind === "needs_context") review.decision = kind;
        else review.confidence = 0.1;
      }
      return output;
    } });
    const selection = await test.selectComplete();
    expect(selection.selectedEvidence).toHaveLength(1);
    expect(selection.selectedEvidence[0]!.feedItemId).not.toBe(abstainingId);
    expect(selection.selectedEvidence[0]!.contentQuality?.reason).toBe("promotion_assessment:promote");
    const publication = publicationProbe(test.runtime, selection);
    await publication.attempt();
    expect(publication.publish).toHaveBeenCalledTimes(1);
  });

  it.each(["needs_context", "bounded rejection"])("does not turn %s into exhaustive no-signal", async (kind) => {
    const test = await selectorWiring({ extraCandidates: kind === "bounded rejection" ? 199 : 0,
      output: (command) => {
        const output = selectorOutput(command);
        if (command.purpose === purpose) for (const review of output.reviews as Record<string, unknown>[]) {
          review.decision = kind === "needs_context" ? kind : "reject";
        }
        return output;
      } });
    const publication = publicationProbe(test.runtime);
    await expect(test.selectComplete().then(() => publication.attempt())).rejects.toThrow(/remains pending/u);
    expect(publication.publish).not.toHaveBeenCalled();
    expect(() => test.runtime.assertUsable()).not.toThrow();
    expect(test.events.filter((e) => e.status === "requires_reconciliation")).toEqual([]);
  });

  it.each(["identity", "text", "pending"])("rejects %s drift in admitted assessment evidence", async (kind) => {
    const test = await selectorWiring();
    const selection = await test.selectComplete();
    const item = selection.selectedEvidence[0]!;
    const changed = { ...selection, selectedEvidence: [{ ...item,
      ...(kind === "identity" ? { sourceItemId: "unreviewed-source" } :
        kind === "text" ? { bodyPreview: "Unreviewed replacement text" } :
          { contentQuality: { ...item.contentQuality!, needsLlmReview: true, eligibleForSummary: false } }),
    }] };
    expect(() => test.assessment.assertComplete(2, changed)).toThrow(/reconciliation/u);
    await expect(publicationProbe(test.runtime, changed).attempt()).rejects.toThrow(/reconciliation/u);
  });

  it.each(["disabled", "openai-responses"])("cannot route %s outside the guarded pool", (mode) => {
    const runtime = {} as ReturnType<typeof guardedRefreshRuntime>;
    expect(() => createRefreshAssessmentReviewer({ env: { RELEVANCE_CONTENT_QUALITY_REVIEWER: mode },
      clock: new FixedClock(refreshNow), runtime })).toThrow(/guarded subscription/u);
  });
});
