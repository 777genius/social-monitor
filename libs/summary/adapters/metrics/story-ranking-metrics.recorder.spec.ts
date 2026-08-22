import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";

import {
  STORY_RELATION_CANDIDATE_POLICY_VERSION,
  STORY_RANKING_POLICY_V1,
  aggregateStoryRelationDecisionTraces,
  type StoryRelationDecisionTrace,
  type SummaryEvidenceSelection,
} from "../../domain";
import { StoryRankingMetricsRecorder } from "./story-ranking-metrics.recorder";

describe("StoryRankingMetricsRecorder", () => {
  it("records bounded semantic verification without raw evidence labels", () => {
    const metrics = new InMemoryMetricsRecorder();
    const recorder = new StoryRankingMetricsRecorder(metrics);

    recorder.recordStoryRelationVerification({
      status: "completed",
      candidateCount: 7,
      approvedCount: 2,
    });

    const labels = { status: "completed" };
    expect(
      metrics.latestGaugeValue(
        "summary_story_relation_candidates_total",
        labels,
      ),
    ).toBe(7);
    expect(
      metrics.latestGaugeValue("summary_story_relation_approved_total", labels),
    ).toBe(2);
  });

  it("records aggregate related-topic outcome and latency", () => {
    const metrics = new InMemoryMetricsRecorder();
    const recorder = new StoryRankingMetricsRecorder(metrics);

    recorder.recordRelatedTopicVerification({
      status: "timed_out",
      candidateCount: 3,
      approvedCount: 0,
      latencyMs: 15_000,
    });

    const labels = { outcome: "timed_out" };
    expect(metrics.counterValue(
      "summary_related_topic_verification_outcomes_total",
      labels,
    )).toBe(1);
    expect(metrics.latestGaugeValue(
      "summary_related_topic_verification_latency_ms",
      labels,
    )).toBe(15_000);
    expect(metrics.latestGaugeValue(
      "summary_related_topic_verification_candidates_total",
      labels,
    )).toBe(3);
  });

  it("aggregates decision traces by bounded disposition and versions only", () => {
    const metrics = new InMemoryMetricsRecorder();
    const recorder = new StoryRankingMetricsRecorder(metrics);
    const trace: StoryRelationDecisionTrace = {
      pairId: "high-cardinality-left\u0000high-cardinality-right",
      rankingPolicyVersion: STORY_RANKING_POLICY_V1.version,
      candidatePolicyVersion: STORY_RELATION_CANDIDATE_POLICY_VERSION,
      approvalThreshold: 0.92,
      shortlistRank: 1,
      features: {
        sharedTopicTokenCount: 3,
        sharedAnchorTokenCount: 1,
        sharedEventTokenCount: 1,
        sharedSpecificProductTokenCount: 1,
        topicSimilarity: 0.4,
      },
      disposition: "approved",
      sameStory: true,
      confidenceScore: 0.97,
      rationalePresent: true,
      rationaleCharacterCount: 23,
      applied: true,
    };

    recorder.recordStoryRelationDecisionAggregates(
      aggregateStoryRelationDecisionTraces([trace, trace]),
    );

    const labels = {
      disposition: "approved",
      failure_reason: "none",
      ranking_policy_version: STORY_RANKING_POLICY_V1.version,
      candidate_policy_version: STORY_RELATION_CANDIDATE_POLICY_VERSION,
    };
    expect(
      metrics.counterValue("summary_story_relation_decisions_total", labels),
    ).toBe(2);
    const serializedMetrics = JSON.stringify(
      metrics.counters("summary_story_relation_decisions_total"),
    );
    expect(serializedMetrics).not.toContain("high-cardinality");
    expect(serializedMetrics).not.toContain("rationale");
  });

  it("keeps safe-recall shadow counters aggregate-only and isolated", () => {
    const metrics = new InMemoryMetricsRecorder();
    const recorder = new StoryRankingMetricsRecorder(metrics);

    recorder.recordStoryRelationSafeRecallShadowGeneration([
      {
        reasonCode: "title_normalized_entity_event_evidence",
        candidatePolicyVersion:
          "reader_summary.story_relation.safe_recall_shadow.v2",
        count: 2,
      },
    ]);
    recorder.recordStoryRelationSafeRecallShadowDecisions([
      {
        shadowReasonCode: "title_normalized_entity_event_evidence",
        disposition: "approved",
        rankingPolicyVersion: STORY_RANKING_POLICY_V1.version,
        candidatePolicyVersion:
          "reader_summary.story_relation.safe_recall_shadow.v2",
        count: 1,
      },
    ]);

    expect(
      metrics.counterValue(
        "summary_story_relation_safe_recall_shadow_candidates_total",
        {
          reason_code: "title_normalized_entity_event_evidence",
          candidate_policy_version:
            "reader_summary.story_relation.safe_recall_shadow.v2",
        },
      ),
    ).toBe(2);
    expect(
      metrics.counterValue(
        "summary_story_relation_safe_recall_shadow_decisions_total",
        {
          reason_code: "title_normalized_entity_event_evidence",
          disposition: "approved",
          failure_reason: "none",
          ranking_policy_version: STORY_RANKING_POLICY_V1.version,
          candidate_policy_version:
            "reader_summary.story_relation.safe_recall_shadow.v2",
        },
      ),
    ).toBe(1);
    expect(
      metrics.counters("summary_story_relation_decisions_total"),
    ).toEqual([]);
  });

  it("records production ranking and dedup gauges with the policy version label", () => {
    const metrics = new InMemoryMetricsRecorder();
    const recorder = new StoryRankingMetricsRecorder(metrics);

    recorder.recordStoryRanking(selection());

    const labels = { ranking_policy_version: STORY_RANKING_POLICY_V1.version };
    expect(
      metrics.latestGaugeValue("summary_story_ranking_average_signal", labels),
    ).toBe(2.4);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_cross_provider_cluster_share",
        labels,
      ),
    ).toBe(0.5);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_title_only_cluster_share",
        labels,
      ),
    ).toBe(0.5);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_same_provider_duplicates_total",
        labels,
      ),
    ).toBe(1);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_same_provider_duplicate_max",
        labels,
      ),
    ).toBe(1);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_clusters_without_provider_metrics",
        labels,
      ),
    ).toBe(1);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_top_provider_cluster_share",
        {
          ...labels,
          top_provider_key: "github-repo-radar",
        },
      ),
    ).toBe(0.5);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_selected_evidence_total",
        labels,
      ),
    ).toBe(3);
    expect(
      metrics.latestGaugeValue("summary_story_ranking_provider_count", labels),
    ).toBe(2);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_top_read_eligible_total",
        labels,
      ),
    ).toBe(2);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_downranked_evidence_total",
        labels,
      ),
    ).toBe(1);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_conversation_context_total",
        labels,
      ),
    ).toBe(1);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_provider_evidence_total",
        {
          ...labels,
          provider_key: "reddit",
        },
      ),
    ).toBe(2);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_coverage_warning_present",
        {
          ...labels,
          coverage_warning: "downranked_evidence_present",
        },
      ),
    ).toBe(1);
    expect(
      metrics.latestGaugeValue(
        "summary_story_ranking_coverage_warning_present",
        {
          ...labels,
          coverage_warning: "single_provider",
        },
      ),
    ).toBe(0);
    expect(
      metrics.latestGaugeValue("summary_reliability_shadow_risk_score", {
        ...labels,
        risk_level: "medium",
      }),
    ).toBe(0.64);
    expect(
      metrics.latestGaugeValue("summary_reliability_shadow_risk_present", {
        ...labels,
        risk_kind: "duplicate_risk",
        risk_level: "medium",
      }),
    ).toBe(1);
    expect(
      metrics.latestGaugeValue("summary_reliability_shadow_risk_present", {
        ...labels,
        risk_kind: "stale_evidence",
        risk_level: "none",
      }),
    ).toBe(0);
    expect(
      metrics.latestGaugeValue("summary_reliability_shadow_risk_value", {
        ...labels,
        risk_kind: "weak_source",
      }),
    ).toBe(0.55);
  });
});

const selection = (): SummaryEvidenceSelection => ({
  rankingPolicyVersion: STORY_RANKING_POLICY_V1.version,
  sourceWindow: {
    windowId: "window-1",
    startedAt: new Date("2026-06-23T08:00:00.000Z"),
    endedAt: new Date("2026-06-23T09:00:00.000Z"),
    selectedFeedItemIds: ["feed-reddit-1", "feed-reddit-2", "feed-github"],
    storyClusterIds: ["story:title-only", "story:cross-provider"],
  },
  clusters: [
    {
      id: "story:title-only",
      storyKey: "title:browser-agent-rumor",
      rankingPolicyVersion: STORY_RANKING_POLICY_V1.version,
      representativeFeedItemId: "feed-reddit-1",
      duplicateFeedItemIds: ["feed-reddit-2"],
      interestIds: ["interest-ai"],
      providerKeys: ["reddit"],
      score: 2,
      observedAtRange: {
        startedAt: new Date("2026-06-23T08:00:00.000Z"),
        endedAt: new Date("2026-06-23T08:30:00.000Z"),
      },
      whyImportant: ["Clustered 2 related source items"],
    },
    {
      id: "story:cross-provider",
      storyKey: "github-repo:openai/codex",
      rankingPolicyVersion: STORY_RANKING_POLICY_V1.version,
      representativeFeedItemId: "feed-github",
      duplicateFeedItemIds: [],
      interestIds: ["interest-ai"],
      providerKeys: ["github-repo-radar", "hacker-news"],
      score: 2.8,
      observedAtRange: {
        startedAt: new Date("2026-06-23T08:10:00.000Z"),
        endedAt: new Date("2026-06-23T08:40:00.000Z"),
      },
      whyImportant: ["Confirmed by 2 providers"],
    },
  ],
  selectedEvidence: [
    {
      feedItemId: "feed-reddit-1",
      sourceItemId: "reddit-1",
      sourceBindingId: "binding-reddit",
      interestId: "interest-ai",
      providerKey: "reddit",
      canonicalUrl: "https://reddit.com/r/programming/comments/abc",
      title: "Browser agent rumor",
      publishedAt: new Date("2026-06-23T07:00:00.000Z"),
      observedAt: new Date("2026-06-23T08:00:00.000Z"),
      score: 2,
      whyImportant: ["Popular Reddit thread"],
      contentQuality: {
        qualityScore: 1,
        interestRelevanceScore: 1,
        engagementIntegrityScore: 1,
        eligibleForSummary: true,
        eligibleForTopRead: true,
        needsLlmReview: false,
        decision: "promote",
        flags: [],
        reason: "Useful Reddit evidence",
      },
    },
    {
      feedItemId: "feed-reddit-2",
      sourceItemId: "reddit-2",
      sourceBindingId: "binding-reddit",
      interestId: "interest-ai",
      providerKey: "reddit",
      canonicalUrl: "https://reddit.com/r/programming/comments/abc?sort=top",
      title: "Browser agent rumor duplicate",
      publishedAt: new Date("2026-06-23T07:05:00.000Z"),
      observedAt: new Date("2026-06-23T08:05:00.000Z"),
      score: 1.9,
      whyImportant: ["Duplicate Reddit thread"],
      contentQuality: {
        qualityScore: 0.6,
        interestRelevanceScore: 0.6,
        engagementIntegrityScore: 0.7,
        eligibleForSummary: true,
        eligibleForTopRead: false,
        needsLlmReview: true,
        decision: "downrank",
        flags: ["weak_interest_match"],
        reason: "Duplicate has weaker interest match",
      },
    },
    {
      feedItemId: "feed-github",
      sourceItemId: "github-1",
      sourceBindingId: "binding-github",
      interestId: "interest-ai",
      providerKey: "github-repo-radar",
      canonicalUrl: "https://github.com/openai/codex",
      title: "openai/codex",
      publishedAt: new Date("2026-06-23T07:10:00.000Z"),
      observedAt: new Date("2026-06-23T08:10:00.000Z"),
      score: 2.8,
      whyImportant: ["Repository is gaining stars"],
      providerMetricLabels: [{ label: "Stars", value: "54,000" }],
      providerMetricSummary: "54,000 total stars",
      conversationContext: {
        rankingBasis: "cohort_baseline_v1",
        bundleScore: 1.2,
        units: [],
      },
    },
  ],
});
