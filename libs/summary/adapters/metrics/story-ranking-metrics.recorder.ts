import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';

import { buildStoryRankingTelemetrySnapshot } from '../../domain';
import type { StoryRankingMetricsPort } from '../../ports';
import type { BriefingEvidenceSelection } from '../../domain';

export class StoryRankingMetricsRecorder implements StoryRankingMetricsPort {
  constructor(private readonly metrics: MetricsRecorderPort) {}

  recordStoryRanking(selection: BriefingEvidenceSelection): void {
    const snapshot = buildStoryRankingTelemetrySnapshot(selection);
    const labels = {
      ranking_policy_version: snapshot.rankingPolicyVersion,
    };

    this.metrics.recordGauge({
      name: 'summary_story_ranking_average_signal',
      value: snapshot.averageStorySignal,
      labels,
    });
    this.metrics.recordGauge({
      name: 'summary_story_ranking_cross_provider_cluster_share',
      value: snapshot.crossProviderClusterShare,
      labels,
    });
    this.metrics.recordGauge({
      name: 'summary_story_ranking_title_only_cluster_share',
      value: snapshot.titleOnlyClusterShare,
      labels,
    });
    this.metrics.recordGauge({
      name: 'summary_story_ranking_same_provider_duplicates_total',
      value: snapshot.sameProviderDuplicateCount,
      labels,
    });
    this.metrics.recordGauge({
      name: 'summary_story_ranking_same_provider_duplicate_max',
      value: snapshot.maxSameProviderDuplicateCount,
      labels,
    });
    this.metrics.recordGauge({
      name: 'summary_story_ranking_clusters_without_provider_metrics',
      value: snapshot.clustersWithoutProviderMetrics,
      labels,
    });
    this.metrics.recordGauge({
      name: 'summary_story_ranking_top_provider_cluster_share',
      value: snapshot.topProviderClusterShare,
      labels: {
        ...labels,
        top_provider_key: snapshot.topProviderKey,
      },
    });
  }
}
