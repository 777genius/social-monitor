import '../value_objects/provider_metric_label.dart';
import '../value_objects/signal_score.dart';

final class TopRead {
  const TopRead({
    required this.title,
    required this.providerKey,
    required this.reason,
    required this.matchedTopicIds,
    required this.matchedRules,
    required this.signalScore,
    required this.confidence,
    required this.confirmedProviderKeys,
    required this.providerMetrics,
    required this.whyImportant,
    required this.whyNow,
    required this.citationIds,
    this.canonicalUrl,
  });

  final String title;
  final String providerKey;
  final String reason;
  final List<String> matchedTopicIds;
  final List<String> matchedRules;
  final SignalScore signalScore;
  final TopReadConfidence confidence;
  final List<String> confirmedProviderKeys;
  final List<ProviderMetric> providerMetrics;
  final List<String> whyImportant;
  final String whyNow;
  final List<String> citationIds;
  final String? canonicalUrl;
}

final class TopReadConfidence {
  const TopReadConfidence({
    required this.level,
    required this.score,
    required this.rationale,
  });

  final String level;
  final double score;
  final String rationale;
}
