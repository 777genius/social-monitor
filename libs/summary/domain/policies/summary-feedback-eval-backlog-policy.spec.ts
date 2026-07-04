import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { SummaryFeedback } from "../entities/summary-feedback";
import {
  buildSummaryFeedbackEvalBacklog,
  buildSummaryFeedbackEvalBacklogItem,
  summaryFeedbackEvalBacklogPolicyCoverage,
  summaryFeedbackToEvalBacklogSignal,
} from "./summary-feedback-eval-backlog-policy";

describe("summary feedback eval backlog policy", () => {
  it("maps wrong-fact feedback to a blocking factuality eval item", () => {
    const item = buildSummaryFeedbackEvalBacklogItem({
      feedbackId: "feedback-wrong-fact-1",
      category: "wrong_fact",
      rating: 1,
      triageOwner: "summary-owner",
      eligibleForEvalFixture: true,
      releaseBlocking: true,
      summaryEvidence: fullEvidence(),
      hardeningAction: {
        actionType: "eval_fixture",
        command: "npm run check:summary-evals",
        artifact: "ops/evals/summary-eval-output.json",
        fixtureIds: ["feedback-wrong-fact-grounding"],
        exitCondition: "Covered by the committed wrong-fact fixture.",
      },
    });

    expect(item).toMatchObject({
      itemId: "summary-feedback-eval-feedback-wrong-fact-1",
      label: "factuality_regression",
      priority: "p0_blocker",
      evalFixtureEligible: true,
      releaseBlocking: true,
      targetEvalSuites: ["summary_quality"],
      requiredEvidence: [
        "summary",
        "interest",
        "citation",
        "feed_item",
        "source_item",
        "provider",
      ],
      missingEvidence: [],
      recommendedAction: {
        actionType: "eval_fixture",
        fixtureIds: ["feedback-wrong-fact-grounding"],
      },
    });
    expect(item.reasonCodes).toEqual(
      expect.arrayContaining([
        "category:wrong_fact",
        "eval_fixture_candidate",
        "label:factuality_regression",
        "low_rating",
        "release_blocking",
      ]),
    );
  });

  it("keeps source requests as planner demand signals instead of summary eval fixtures", () => {
    const item = buildSummaryFeedbackEvalBacklogItem({
      feedbackId: "feedback-source-request-1",
      category: "source_request",
      rating: 3,
      triageOwner: "source-owner",
      eligibleForEvalFixture: false,
      summaryEvidence: {
        summaryId: "summary-1",
        interestId: "interest-1",
      },
    });

    expect(item).toMatchObject({
      label: "source_request_signal",
      priority: "p2_medium",
      evalFixtureEligible: false,
      targetEvalSuites: ["source_query_planner"],
      recommendedAction: {
        actionType: "source_planner_review",
        command: "npm run check:source-query-planner-eval",
      },
    });
    expect(item.reasonCodes).toContain("not_summary_eval_fixture");
  });

  it("reports missing citation evidence for citation-backed categories", () => {
    const item = buildSummaryFeedbackEvalBacklogItem({
      feedbackId: "feedback-bad-citation-1",
      category: "bad_citation",
      rating: 2,
      eligibleForEvalFixture: true,
      summaryEvidence: {
        summaryId: "summary-1",
        interestId: "interest-1",
      },
    });

    expect(item.missingEvidence).toEqual([
      "citation",
      "feed_item",
      "source_item",
      "provider",
    ]);
    expect(item.reasonCodes).toContain("evidence_incomplete");
  });

  it("dedupes repeated feedback and keeps the highest-priority item", () => {
    const items = buildSummaryFeedbackEvalBacklog([
      {
        feedbackId: "feedback-low-relevance-1",
        category: "low_relevance",
        rating: 4,
        eligibleForEvalFixture: true,
        summaryEvidence: fullEvidence(),
      },
      {
        feedbackId: "feedback-low-relevance-1",
        category: "low_relevance",
        rating: 1,
        eligibleForEvalFixture: true,
        summaryEvidence: fullEvidence(),
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      priority: "p1_high",
      label: "relevance_regression",
    });
  });

  it("covers every feedback category with deterministic label policy", () => {
    expect(summaryFeedbackEvalBacklogPolicyCoverage()).toEqual([
      expect.objectContaining({ category: "wrong_fact" }),
      expect.objectContaining({ category: "missing_source" }),
      expect.objectContaining({ category: "bad_citation" }),
      expect.objectContaining({ category: "low_relevance" }),
      expect.objectContaining({ category: "too_verbose" }),
      expect.objectContaining({ category: "too_terse" }),
      expect.objectContaining({ category: "source_request" }),
      expect.objectContaining({ category: "ux_confusing" }),
      expect.objectContaining({ category: "other" }),
    ]);
  });

  it("maps persisted feedback snapshots without leaking repository concerns into domain policy", () => {
    const signal = summaryFeedbackToEvalBacklogSignal(
      SummaryFeedback.record({
        id: "feedback-1",
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        summaryId: "summary-1",
        interestId: "interest-1",
        idempotencyKey: "feedback-key-1",
        submittedBy: "operator-1",
        rating: 2,
        category: "missing_source",
        comment: "Missed a relevant Reddit thread.",
        evidence: fullEvidence(),
        triageOwner: "summary-owner",
        eligibleForEvalFixture: true,
        createdAt: new Date("2026-07-04T00:00:00.000Z"),
      }),
    );

    expect(buildSummaryFeedbackEvalBacklogItem(signal)).toMatchObject({
      feedbackId: "feedback-1",
      label: "evidence_recall_regression",
      targetEvalSuites: ["summary_quality", "source_ranking"],
    });
  });
});

const fullEvidence = () => ({
  summaryId: "summary-1",
  interestId: "interest-1",
  citationId: "citation-1",
  feedItemId: "feed-item-1",
  sourceItemId: "source-item-1",
  providerKey: "reddit",
});
