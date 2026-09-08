import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { FeedItem } from "@social-monitor/feed/domain";
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
    expect(test.preflight.assessmentCandidateCount).toBe(2);
    expect(test.preflight.canonicalEvidence.map((item) => item.feedItemId).sort())
      .toEqual(["synthetic-reddit", "synthetic-x"]);
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

  it.each(["promotion_assessment_pending:needs_context", "promotion_assessment_not_requested:hard_gate",
    "promotion_assessment:reject", "High-context source", ""])(
    "rejects forged selected identity and body despite reason %j", async (reason) => {
      const test = await selectorWiring();
      const selection = await test.selectComplete();
      const item = selection.selectedEvidence[0]!;
      const forged = { ...selection, selectedEvidence: [{ ...item,
        feedItemId: "never-reviewed", sourceItemId: "never-reviewed-source",
        bodyPreview: "An unreviewed replacement claim.",
        contentQuality: { ...item.contentQuality!, reason },
      }] };
      expect(() => test.assessment.assertComplete(2, forged)).toThrow(/reconciliation/u);
      const publication = publicationProbe(test.runtime, forged);
      await expect(publication.attempt()).rejects.toThrow(/reconciliation/u);
      expect(publication.publish).not.toHaveBeenCalled();
      const spent = test.commands.length;
      await test.select();
      expect(test.commands).toHaveLength(spent);
    });

  it.each(["promotion_assessment_pending:needs_context", "promotion_assessment:reject", "ordinary reason"])(
    "rejects an inconsistent reason %j even with reviewed identity and text", async (reason) => {
      const test = await selectorWiring();
      const selection = await test.selectComplete();
      const item = selection.selectedEvidence[0]!;
      expect(() => test.assessment.assertComplete(2, { ...selection, selectedEvidence: [{ ...item,
        contentQuality: { ...item.contentQuality!, reason },
      }] })).toThrow(/reconciliation/u);
    });

  it.each(["reject", "needs_context"])("rejects a forged eligible %s decision", async (decision) => {
    const test = await selectorWiring();
    const selection = await test.selectComplete();
    const item = selection.selectedEvidence[0]!;
    expect(() => test.assessment.assertComplete(2, { ...selection, selectedEvidence: [{ ...item,
      contentQuality: { ...item.contentQuality!, decision },
    }] })).toThrow(/reconciliation/u);
  });

  it.each(["github-repo-radar", "github-trending-page", "rss"])(
    "does not exempt an unknown identity just because its provider claims %s", async (providerKey) => {
      const test = await selectorWiring();
      const selection = await test.selectComplete();
      const item = selection.selectedEvidence[0]!;
      expect(() => test.assessment.assertComplete(2, { ...selection, selectedEvidence: [{ ...item,
        feedItemId: "never-reviewed", sourceItemId: "never-reviewed-source", providerKey,
        bodyPreview: "An unreviewed replacement claim.", promotionFacts: undefined,
        contentQuality: { ...item.contentQuality!, reason: "ordinary reason" },
      }] })).toThrow(/reconciliation/u);
    });

  it.each(["sanitized", "truncated"])("accepts legitimate canonical %s text binding", async (kind) => {
    const publish = FeedItem.publish.bind(FeedItem);
    jest.spyOn(FeedItem, "publish").mockImplementation((input) => publish({ ...input,
      title: kind === "sanitized" ? `  ${input.title}  ` : input.title,
      bodyPreview: kind === "sanitized" ? `${input.bodyPreview}\n token=synthetic-redaction-fixture`
        : `${input.bodyPreview} `.repeat(160),
    }));
    const test = await selectorWiring();
    const selection = await test.selectComplete();
    expect(selection.selectedEvidence.length).toBeGreaterThan(0);
    if (kind === "sanitized") expect(selection.selectedEvidence.every((item) =>
      !item.bodyPreview?.includes("synthetic-redaction-fixture"))).toBe(true);
    else expect(selection.selectedEvidence.some((item) => item.bodyPreview!.length > 12_000)).toBe(true);
    const publication = publicationProbe(test.runtime, selection);
    await publication.attempt();
    expect(publication.publish).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["github-repo-radar", "feed"], ["github-repo-radar", "source"],
    ["github-trending-page", "feed"], ["github-trending-page", "source"],
    ["github-repo-radar", "pending"], ["github-trending-page", "rejected"],
    ...["github-repo-radar", "github-trending-page"].flatMap((provider) =>
      ["unknown", "text", "provenance", "snapshot mutation"].map((kind) => [provider, kind])),
  ])(
    "retains genuine canonical %s exemption and rejects %s inconsistency", async (providerKey, identity) => {
      const publish = FeedItem.publish.bind(FeedItem);
      jest.spyOn(FeedItem, "publish").mockImplementation((input) => publish(input.id !== "synthetic-reddit"
        ? input : { ...input, id: "synthetic-github", sourceItemId: "source-github", sourceBindingId: "binding-github",
          providerKey, canonicalUrl: "https://github.com/synthetic/compiler-tools",
          title: "Synthetic compiler tools for AI coding agents",
          bodyPreview: "A TypeScript compiler toolkit with documented interfaces for AI developer tools.",
          providerMetadata: providerKey === "github-repo-radar"
            ? { kind: "github_repository_trend", contentKind: "repository",
                repository: { fullName: "synthetic/compiler-tools", forksCount: 500 },
                trend: { primaryWindow: "24h", checkedAt: "2026-09-05T21:55:00.000Z",
                  totalStars: 20_000, stars24h: 2_000, forks24h: 200 } }
            : { kind: "github_trending_page_repository",
                repository: { fullName: "synthetic/compiler-tools", totalStars: 20_000, forksCount: 500 },
                trending: { rank: 1, starsGained: 2_000, window: "daily" } },
        }));
      const test = await selectorWiring();
      expect(test.preflight.assessmentCandidateCount).toBe(1);
      const selection = await test.selectComplete();
      const github = selection.selectedEvidence.find((item) => item.feedItemId === "synthetic-github")!;
      expect(github).toBeDefined();
      expect(github.contentQuality!.reason).not.toMatch(/^promotion_assessment/u);
      const calls = test.commands.filter((command) => command.purpose === purpose);
      expect(calls).toHaveLength(1);
      expect(JSON.parse(calls[0]!.prompt).candidates.map((item: { candidateId: string }) => item.candidateId))
        .toEqual(["synthetic-x"]);
      const publication = publicationProbe(test.runtime, selection);
      await publication.attempt();
      expect(publication.publish).toHaveBeenCalledTimes(1);
      const social = selection.selectedEvidence.find((item) => item.feedItemId === "synthetic-x")!;
      expect(social).toBeDefined();
      // Copying the full exemption classification cannot override a recorded identity.
      if (identity === "snapshot mutation") {
        const trusted = test.preflight.canonicalEvidence.find((item) => item.feedItemId === github.feedItemId)!;
        Object.assign(trusted, { title: "Replacement title after reviewer creation" });
      }
      const changed = identity === "unknown"
        ? { ...github, feedItemId: "unknown-feed", sourceItemId: "unknown-source",
            sourceBindingId: "unknown-binding", interestId: "unknown-interest" }
        : identity === "text" || identity === "snapshot mutation"
          ? { ...github, title: "Replacement title after reviewer creation" }
        : identity === "provenance"
          ? { ...github, promotionFacts: { ...github.promotionFacts!, metricsState: "conflict" as const } }
        : identity === "pending" || identity === "rejected"
        ? { ...github, contentQuality: { ...github.contentQuality!,
            reason: identity === "pending" ? "promotion_assessment_pending:needs_context" : "promotion_assessment:reject" } }
        : { ...github,
        feedItemId: identity === "feed" ? social.feedItemId : "never-reviewed", sourceItemId: social.sourceItemId,
        sourceBindingId: social.sourceBindingId, interestId: social.interestId,
      };
      expect(() => test.assessment.assertComplete(1, { ...selection, selectedEvidence: [changed] }))
        .toThrow(/reconciliation/u);
      expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
    });
});
