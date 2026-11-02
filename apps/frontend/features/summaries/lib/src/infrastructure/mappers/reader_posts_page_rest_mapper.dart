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
      ? 'No AI assessment'
      : dto.relevance == 'insufficient_context' &&
            dto.usefulness == 'insufficient_context'
      ? 'Not enough information to assess'
      : 'Topic: ${_assessmentLabel(dto.relevance!)} · '
            'Usefulness: ${_assessmentLabel(dto.usefulness!)}';
  final assessment = dto.quotedContext == 'not_captured'
      ? '$judgment · Quoted post text unavailable'
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
      if (dto.providerFamily == 'x') ...[
        if (_nativeLikes(dto.likeCount) case final likes?)
          ProviderMetric(label: 'Likes', value: likes.toString()),
      ] else if (dto.engagement case final engagement?)
        ProviderMetric(
          label: switch (dto.providerFamily) {
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

int? _nativeLikes(num? value) =>
    value != null &&
        value.isFinite &&
        value >= 0 &&
        value <= 9007199254740991 &&
        value % 1 == 0
    ? value.toInt()
    : null;

String _assessmentLabel(String value) => switch (value) {
  'central' => 'Direct match',
  'relevant' => 'Relevant',
  'adjacent' => 'Related',
  'unrelated' => 'Off topic',
  'important' => 'Important',
  'useful' => 'Useful',
  'context' => 'Background',
  'noise' => 'Low',
  'insufficient_context' => 'Not enough information',
  _ => 'Unknown assessment',
};
