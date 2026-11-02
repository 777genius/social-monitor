import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/value_objects/reader_captured_source.dart';
import '../../domain/value_objects/reader_posts_page.dart';

ReaderPostsPage readerPostsPageFromRest(generated.ReaderPostsPageDto dto) =>
    ReaderPostsPage(
      items: dto.items.map(readerPostFromRest).toList(growable: false),
      total: dto.total.toInt(),
      providerKeys: List.unmodifiable(dto.providerKeys),
      nextCursor: dto.nextCursor,
    );

TopRead readerPostFromRest(generated.ReaderPostDto dto) {
  final judgment = dto.relevance == null || dto.usefulness == null
      ? 'Not assessed'
      : '${_assessmentLabel(dto.relevance!)} · ${_assessmentLabel(dto.usefulness!)}';
  final assessment = dto.quotedContext == 'not_captured'
      ? '$judgment · Quoted context was not captured'
      : judgment;
  return TopRead(
    title: dto.title,
    providerKey: dto.providerKey,
    // Browse identity does not grant promotion, story-cluster or headline authority.
    storyClusterId: 'source:${dto.sourceItemId}',
    summary: dto.bodyPreview.isEmpty ? assessment : dto.bodyPreview,
    capturedSource: ReaderCapturedSource(
      title: dto.title,
      body: dto.bodyPreview.isEmpty ? null : dto.bodyPreview,
      captureAvailability: ReaderCaptureAvailability.available,
      reviewAvailability: dto.bodyPreview.isEmpty
          ? ReaderSourceReviewAvailability.titleOnly
          : ReaderSourceReviewAvailability.bodyPresent,
    ),
    canonicalUrl: dto.canonicalUrl,
    publishedAt: DateTime.tryParse(dto.publishedAt),
    reason: assessment,
    matchedInterestIds: const [],
    matchedRules: const [],
    signalScore: SignalScore.zero,
    confidence: const TopReadConfidence(
      level: 'unknown',
      score: 0,
      rationale: '',
    ),
    confirmedProviderKeys: const [],
    providerMetrics: [
      if (dto.engagement case final engagement?)
        ProviderMetric(
          label: switch (dto.providerFamily) {
            'x' => 'Likes + 2× reposts',
            'reddit' => 'Score',
            'hacker_news' => 'Points',
            'github_radar' => 'Star/fork activity',
            _ => 'Engagement',
          },
          value: engagement % 1 == 0
              ? engagement.toInt().toString()
              : engagement.toString(),
        ),
    ],
    whyImportant: const [],
    whyNow: '',
    citationIds: const [],
  );
}

String _assessmentLabel(String value) => switch (value) {
  'central' => 'Central',
  'relevant' => 'Relevant',
  'adjacent' => 'Adjacent',
  'unrelated' => 'Unrelated',
  'important' => 'Important',
  'useful' => 'Useful',
  'context' => 'Context',
  'noise' => 'Noise',
  'insufficient_context' => 'Insufficient context',
  _ => 'Unknown assessment',
};
