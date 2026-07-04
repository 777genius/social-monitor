import type { MetricsRecorderPort } from "@social-monitor/platform-metrics";

import {
  buildStoryRankingTelemetrySnapshot,
  readerSummaryReliabilityRiskKinds,
  summaryEvidenceCoverageWarnings,
} from "../../domain";
import type { StoryRankingMetricsPort } from "../../ports";
import type { SummaryEvidenceSelection } from "../../domain";

export class StoryRankingMetricsRecorder implements StoryRankingMetricsPort {
  constructor(private readonly metrics: MetricsRecorderPort) {}

  recordStoryRanking(selection: SummaryEvidenceSelection): void {
    const snapshot = buildStoryRankingTelemetrySnapshot(selection);
    const labels = {
      ranking_policy_version: snapshot.rankingPolicyVersion,
    };

    this.metrics.recordGauge({
      name: "summary_story_ranking_average_signal",
      value: snapshot.averageStorySignal,
      labels,
    });
    this.metrics.recordGauge({
      name: "summary_story_ranking_cross_provider_cluster_share",
      value: snapshot.crossProviderClusterShare,
      labels,
    });
    this.metrics.recordGauge({
      name: "summary_story_ranking_title_only_cluster_share",
      value: snapshot.titleOnlyClusterShare,
      labels,
    });
    this.metrics.recordGauge({
      name: "summary_story_ranking_same_provider_duplicates_total",
      value: snapshot.sameProviderDuplicateCount,
      labels,
    });
    this.metrics.recordGauge({
      name: "summary_story_ranking_same_provider_duplicate_max",
      value: snapshot.maxSameProviderDuplicateCount,
      labels,
    });
    this.metrics.recordGauge({
      name: "summary_story_ranking_clusters_without_provider_metrics",
      value: snapshot.clustersWithoutProviderMetrics,
      labels,
    });
    this.metrics.recordGauge({
      name: "summary_story_ranking_top_provider_cluster_share",
      value: snapshot.topProviderClusterShare,
      labels: {
        ...labels,
        top_provider_key: snapshot.topProviderKey,
      },
    });
    this.metrics.recordGauge({
      name: "summary_story_ranking_selected_evidence_total",
      value: snapshot.evidenceProfile.selectedEvidenceCount,
      labels,
    });
    this.metrics.recordGauge({
      name: "summary_story_ranking_provider_count",
      value: snapshot.evidenceProfile.providerCount,
      labels,
    });
    this.metrics.recordGauge({
      name: "summary_story_ranking_top_read_eligible_total",
      value: snapshot.evidenceProfile.topReadEligibleCount,
      labels,
    });
    this.metrics.recordGauge({
      name: "summary_story_ranking_downranked_evidence_total",
      value: snapshot.evidenceProfile.downrankedEvidenceCount,
      labels,
    });
    this.metrics.recordGauge({
      name: "summary_story_ranking_conversation_context_total",
      value: snapshot.evidenceProfile.conversationContextItemCount,
      labels,
    });

    for (const provider of snapshot.evidenceProfile.providerCounts) {
      this.metrics.recordGauge({
        name: "summary_story_ranking_provider_evidence_total",
        value: provider.count,
        labels: {
          ...labels,
          provider_key: provider.providerKey,
        },
      });
    }

    const activeWarnings = new Set(snapshot.coverageWarnings);
    for (const warning of summaryEvidenceCoverageWarnings) {
      this.metrics.recordGauge({
        name: "summary_story_ranking_coverage_warning_present",
        value: activeWarnings.has(warning) ? 1 : 0,
        labels: {
          ...labels,
          coverage_warning: warning,
        },
      });
    }

    this.metrics.recordGauge({
      name: "summary_reliability_shadow_risk_score",
      value: snapshot.reliabilityReport.riskScore,
      labels: {
        ...labels,
        risk_level: snapshot.reliabilityReport.riskLevel,
      },
    });

    const activeRisks = new Map(
      snapshot.reliabilityReport.risks.map((risk) => [risk.kind, risk] as const),
    );
    for (const riskKind of readerSummaryReliabilityRiskKinds) {
      const risk = activeRisks.get(riskKind);
      this.metrics.recordGauge({
        name: "summary_reliability_shadow_risk_present",
        value: risk === undefined ? 0 : 1,
        labels: {
          ...labels,
          risk_kind: riskKind,
          risk_level: risk?.level ?? "none",
        },
      });
      this.metrics.recordGauge({
        name: "summary_reliability_shadow_risk_value",
        value: risk?.score ?? 0,
        labels: {
          ...labels,
          risk_kind: riskKind,
        },
      });
    }
  }
}
