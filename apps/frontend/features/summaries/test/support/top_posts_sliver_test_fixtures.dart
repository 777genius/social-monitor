import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';

import 'summaries_test_fixtures.dart';

List<TopReadApiDto> lazyTopReadApiDtos(int count) {
  return List<TopReadApiDto>.generate(count, (index) {
    return TopReadApiDto(
      storyClusterId: 'story:lazy-$index',
      cardKind: 'curated_top_read',
      promotionAttestation: ReaderPostPromotionAttestationApiDto(
        candidateId: 'feed:lazy-$index',
        canonicalIdentity: 'story:lazy-$index',
        placement: 'top',
        slot: index,
        decision: 'promote_top',
      ),
      title: 'Lazy top post $index',
      providerKey: 'reddit',
      reason: 'Post $index explains why this signal matters.',
      matchedInterestIds: const ['ai-developer-tools'],
      signalScore: (count - index).toDouble(),
      confidence: const TopReadConfidenceApiDto(
        level: 'medium',
        score: 0.55,
        rationale: 'Same-source support.',
      ),
      confirmedProviderKeys: const ['reddit'],
      providerMetrics: [
        ProviderMetricApiDto(label: 'Score', value: '${1000 - index}'),
      ],
      citationIds: ['lazy-c-$index'],
    );
  });
}

List<TopReadApiDto> lazyAdditionalStoryApiDtos(
  int count, {
  int startIndex = 0,
}) {
  return List<TopReadApiDto>.generate(count, (offset) {
    final index = startIndex + offset;
    return TopReadApiDto(
      storyClusterId: 'story:lazy-$index',
      cardKind: 'additional_notable_story',
      promotionAttestation: ReaderPostPromotionAttestationApiDto(
        candidateId: 'feed:lazy-$index',
        canonicalIdentity: 'story:lazy-$index',
        placement: 'additional',
        slot: offset,
        decision: 'promote_additional',
      ),
      title: 'Lazy top post $index',
      providerKey: 'reddit',
      reason: 'Post $index explains why this signal matters.',
      matchedInterestIds: const ['ai-developer-tools'],
      signalScore: (count - offset).toDouble(),
      confidence: const TopReadConfidenceApiDto(
        level: 'medium',
        score: 0.55,
        rationale: 'Same-source support.',
      ),
      confirmedProviderKeys: const ['reddit'],
      providerMetrics: [
        ProviderMetricApiDto(label: 'Score', value: '${1000 - index}'),
      ],
      citationIds: ['lazy-c-$index'],
    );
  });
}

List<SummaryCitationApiDto> lazyCitationApiDtos(int count) {
  return List<SummaryCitationApiDto>.generate(count, (index) {
    return summaryCitationApiDto(
      id: 'lazy-c-$index',
      providerKey: 'reddit',
      canonicalUrl: 'https://reddit.example/post/$index',
    );
  });
}
