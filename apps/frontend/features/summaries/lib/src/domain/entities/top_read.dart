import '../value_objects/preview_media.dart';
import '../value_objects/provider_metric_label.dart';
import '../value_objects/reader_post_promotion_attestation.dart';
import '../value_objects/signal_score.dart';

final class TopRead {
  const TopRead({
    this.storyClusterId,
    this.cardKind = ReaderSummaryCardKind.unsupported,
    this.relationId,
    this.targetStoryClusterId,
    this.promotionAttestation,
    required this.title,
    required this.providerKey,
    required this.reason,
    required this.matchedInterestIds,
    required this.matchedRules,
    required this.signalScore,
    required this.confidence,
    required this.confirmedProviderKeys,
    required this.providerMetrics,
    required this.whyImportant,
    required this.whyNow,
    required this.citationIds,
    this.publishedAt,
    this.canonicalUrl,
    this.previewMedia,
  });

  final String? storyClusterId;
  final ReaderSummaryCardKind cardKind;
  final String? relationId;
  final String? targetStoryClusterId;
  final ReaderPostPromotionAttestation? promotionAttestation;
  final String title;
  final String providerKey;
  final String reason;
  final List<String> matchedInterestIds;
  final List<String> matchedRules;
  final SignalScore signalScore;
  final TopReadConfidence confidence;
  final List<String> confirmedProviderKeys;
  final List<ProviderMetric> providerMetrics;
  final List<String> whyImportant;
  final String whyNow;
  final List<String> citationIds;
  final DateTime? publishedAt;
  final String? canonicalUrl;
  final PreviewMedia? previewMedia;
}

enum ReaderSummaryCardKind {
  curatedTopRead,
  additionalNotableStory,
  relatedTopic,
  supplementalTrend,
  unsupported,
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
