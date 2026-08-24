import 'dart:convert';

import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/generated_summary_rest_mapper.dart';

import '../../../support/additional_stories_test_scenarios.dart';
import 'additional_stories_promotion_attestation_fixture.dart';

Map<String, dynamic> additionalStoriesRestPayload({
  required Set<AdditionalStoriesNegativeCase> negativeCases,
}) => additionalStoriesRestFixture(negativeCases: negativeCases).toJson();

ReaderSummaryApiDto mapAdditionalStoriesRestPayload(String serializedPayload) {
  final generatedResponse = generated.ReaderSummaryArtifactResponseDto.fromJson(
    jsonDecode(serializedPayload) as Map<String, dynamic>,
  );
  return const GeneratedSummaryRestMapper().readerSummary(generatedResponse);
}

generated.ReaderSummaryArtifactResponseDto additionalStoriesRestFixture({
  Set<AdditionalStoriesNegativeCase> negativeCases = const {
    AdditionalStoriesNegativeCase.unknownKind,
    AdditionalStoriesNegativeCase.malformedMarkers,
    AdditionalStoriesNegativeCase.noncanonicalValue,
    AdditionalStoriesNegativeCase.duplicateRawId,
    AdditionalStoriesNegativeCase.duplicateCanonicalId,
    AdditionalStoriesNegativeCase.forgedCluster,
    AdditionalStoriesNegativeCase.forgedCurated,
    AdditionalStoriesNegativeCase.unmarkedTopRead,
    AdditionalStoriesNegativeCase.weakUnmarked,
  },
}) {
  final now = DateTime.utc(2026, 8, 15, 12);
  final subjects = <_SubjectFixture>[
    const _SubjectFixture('watermark-reddit', 'reddit-watermark-question'),
    const _SubjectFixture('unknown-kind', 'unknown-kind-item'),
    const _SubjectFixture('malformed-markers', 'malformed-markers-item'),
    const _SubjectFixture('noncanonical', 'noncanonical-item'),
    const _SubjectFixture('duplicate-raw-a', 'duplicate-raw-item'),
    const _SubjectFixture('duplicate-raw-b', 'duplicate-raw-item'),
    const _SubjectFixture('duplicate-canonical-a', 'duplicate-canonical-item'),
    const _SubjectFixture('duplicate-canonical-b', 'duplicate-canonical-item'),
    const _SubjectFixture('forged-additional', 'forged-additional-item'),
  ];
  final clusterIds = <String>[
    'story:curated-baseline',
    'story:cursor-agents',
    'story:watermark-official',
    for (final subject in subjects) 'story:${subject.slug}',
  ];

  return generated.ReaderSummaryArtifactResponseDto(
    readerSummaryId: additionalStoriesPromotionArtifactId,
    citations: [
      _citation(
        'curated-baseline-citation',
        'feed-curated-baseline',
        'hacker-news',
        'curated-baseline-item',
        'https://news.ycombinator.com/item?id=fixture-curated',
      ),
      _citation(
        'cursor-hn',
        'feed-cursor-hn',
        'hacker-news',
        'cursor-hn-item',
        'https://news.ycombinator.com/item?id=fixture-cursor',
      ),
      _citation(
        'cursor-x',
        'feed-cursor-x',
        'x-twitter',
        'cursor-x-item',
        'https://x.com/fixture/status/cursor-agents',
      ),
      _citation(
        'watermark-official',
        'feed-watermark-official',
        'x-twitter',
        'anthropic-text-watermarking',
        'https://x.com/fixture/status/text-watermarking',
      ),
      _citation(
        'watermark-hn',
        'feed-watermark-hn',
        'hacker-news',
        'watermark-hn-item',
        'https://news.ycombinator.com/item?id=fixture-watermark',
      ),
      for (final subject in subjects)
        _citation(
          '${subject.slug}-citation',
          'feed-${subject.slug}',
          'reddit',
          subject.sourceItemId,
          subject.slug == 'watermark-reddit'
              ? redditStoryUrl
              : 'https://www.reddit.com/r/fixture/comments/${subject.slug}/item/',
        ),
    ],
    confidence: const generated.ReaderSummaryConfidenceDto(
      level: generated.ReaderSummaryConfidenceDtoLevelLevel.medium,
      rationale: 'Deterministic integration fixture.',
      score: 0.7,
    ),
    executiveSummary: 'Additional stories transport regression fixture.',
    freshness: generated.ReaderSummaryFreshnessDto(
      checkedAt: now,
      status: generated.ReaderSummaryFreshnessDtoStatusStatus.fresh,
    ),
    headline: 'Reader summary regression fixture',
    interestHighlights: const [],
    lineage: const generated.ReaderSummaryLineageDto(
      evalDatasetVersion: 'fixture-v1',
      modelVersion: 'deterministic-fixture',
      promptVersion: 'fixture-v1',
      providerVersion: 'fixture-v1',
      rulesVersion: 'fixture-v1',
      schemaVersion: 'reader_summary.artifact.v1',
    ),
    period: generated.ReaderSummaryPeriodDto(
      cadence: generated.ReaderSummaryPeriodDtoCadenceCadence.daily,
      startedAt: now.subtract(const Duration(days: 1)),
      endedAt: now,
      timezone: 'UTC',
      periodKey: 'daily:2026-08-14:UTC',
    ),
    qualityFlags: const [],
    readerBrief: generated.ReaderSummaryReaderBriefDto.fromJson(
      _readerBriefJson(negativeCases),
    ),
    repeatedSignals: const [],
    risksAndUnknowns: const [],
    schemaVersion: 'reader_summary.artifact.v1',
    scope: const generated.ReaderSummaryScopeDto(
      type: generated.ReaderSummaryScopeDtoTypeType.workspace,
    ),
    sourceWindow: generated.ReaderSummarySourceWindowDto(
      startedAt: now.subtract(const Duration(days: 1)),
      endedAt: now,
      ingestionCutoff: now,
      selectedFeedItemIds: [
        'feed-curated-baseline',
        'feed-cursor-hn',
        'feed-cursor-x',
        'feed-watermark-official',
        'feed-watermark-hn',
        for (final subject in subjects) 'feed-${subject.slug}',
      ],
      storyClusterIds: clusterIds,
      windowId: additionalStoriesPromotionSourceWindowId,
    ),
    storyClusters: [
      _cluster('story:curated-baseline', 'feed-curated-baseline', const [
        'hacker-news',
      ], now),
      _cluster(
        'story:cursor-agents',
        'feed-cursor-hn',
        const ['hacker-news', 'x-twitter'],
        now,
        duplicates: const ['feed-cursor-x'],
      ),
      _cluster(
        'story:watermark-official',
        'feed-watermark-official',
        const ['x-twitter', 'hacker-news'],
        now,
        duplicates: const ['feed-watermark-hn'],
      ),
      for (final subject in subjects)
        _cluster('story:${subject.slug}', 'feed-${subject.slug}', const [
          'reddit',
        ], now),
    ],
    tenantId: 'tenant-fixture',
    topStories: const [],
    usage: const generated.ReaderSummaryUsageDto(
      estimatedCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
    ),
    workspaceId: 'workspace-fixture',
  );
}

generated.ReaderSummaryCitationViewDto _citation(
  String id,
  String feedItemId,
  String providerKey,
  String sourceItemId,
  String url,
) => generated.ReaderSummaryCitationViewDto(
  citationId: id,
  feedItemId: feedItemId,
  field: generated.ReaderSummaryCitationViewDtoFieldField.title,
  label: '[$id]',
  providerKey: providerKey,
  sourceItemId: sourceItemId,
  canonicalUrl: url,
);

generated.ReaderSummaryStoryClusterDto _cluster(
  String id,
  String feedItemId,
  List<String> providerKeys,
  DateTime now, {
  List<String> duplicates = const [],
}) => generated.ReaderSummaryStoryClusterDto(
  duplicateFeedItemIds: duplicates,
  id: id,
  interestIds: const [],
  observedAtRange: generated.ReaderSummaryObservedAtRangeDto(
    startedAt: now.subtract(const Duration(hours: 1)),
    endedAt: now,
  ),
  providerKeys: providerKeys,
  representativeFeedItemId: feedItemId,
  score: 0.5,
  storyKey: 'fixture:$id',
  whyImportant: const ['Deterministic fixture story.'],
);

Map<String, Object?> _readerBriefJson(
  Set<AdditionalStoriesNegativeCase> negativeCases,
) => {
  'headline': 'Additional stories integration fixture',
  'oneLineTakeaway': 'Explicit story cards remain isolated by cluster.',
  'bullets': <Object?>[],
  'narrativeSections': <Object?>[],
  'mainTopics': <Object?>[],
  'topicMap': _emptyTopicMap(),
  'qualityState': {
    'status': 'ready',
    'flags': <Object?>[],
    'warnings': <Object?>[],
    'isSingleSource': false,
  },
  'interestSections': <Object?>[],
  'sourceMix': <Object?>[],
  'topReads': [
    _readerItem(
      'Curated baseline story',
      'hacker-news',
      const ['curated-baseline-citation'],
      const [
        'reader-card-kind:curated_top_read',
        'reader-story-cluster:story:curated-baseline',
      ],
    ),
    if (negativeCases.contains(AdditionalStoriesNegativeCase.forgedCurated))
      _readerItem(
        'Forged curated card must not render',
        'reddit',
        const ['forged-additional-citation'],
        const [
          'reader-card-kind:curated_top_read',
          'reader-story-cluster:story:cursor-agents',
        ],
      ),
    if (negativeCases.contains(AdditionalStoriesNegativeCase.unmarkedTopRead))
      _readerItem(
        'Unmarked legacy top read must not render',
        'hacker-news',
        const ['curated-baseline-citation'],
        const [],
      ),
  ],
  'selectedPosts': [
    _readerItem(
      'Cursor background agents launch',
      'hacker-news',
      const ['cursor-hn', 'cursor-x'],
      const [
        'reader-card-kind:additional_notable_story',
        'reader-story-cluster:story:cursor-agents',
      ],
      confirmedProviders: const ['hacker-news', 'x-twitter'],
      supportProviderKeys: const ['x-twitter'],
    ),
    _readerItem(
      'Anthropic publishes an official watermark standard',
      'hacker-news',
      const ['watermark-hn', 'watermark-official'],
      const [
        'reader-card-kind:additional_notable_story',
        'reader-story-cluster:story:watermark-official',
      ],
      promotionSlot: 1,
      confirmedProviders: const ['hacker-news', 'x-twitter'],
      supportProviderKeys: const ['x-twitter'],
    ),
    if (negativeCases.contains(AdditionalStoriesNegativeCase.unknownKind))
      _relatedItem(
        'Unknown relation kind must not render',
        'unknown-kind',
        'unknown-kind-item',
        cardKind: 'future_kind',
      ),
    if (negativeCases.contains(AdditionalStoriesNegativeCase.malformedMarkers))
      _readerItem(
        'Malformed authority markers must not render',
        'reddit',
        const ['malformed-markers-citation'],
        const [
          'reader-card-kind:additional_notable_story:extra',
          'reader-story-cluster:',
        ],
      ),
    if (negativeCases.contains(AdditionalStoriesNegativeCase.noncanonicalValue))
      _relatedItem(
        'Noncanonical relation value must not render',
        'noncanonical',
        'noncanonical-item',
        relationId:
            'related-topic:v1:Reddit:noncanonical-item:rss:anthropic-text-watermarking',
      ),
    if (negativeCases.contains(
      AdditionalStoriesNegativeCase.duplicateRawId,
    )) ...[
      _relatedItem(
        'Duplicate raw relation A must not render',
        'duplicate-raw-a',
        'duplicate-raw-item',
      ),
      _relatedItem(
        'Duplicate raw relation B must not render',
        'duplicate-raw-b',
        'duplicate-raw-item',
      ),
    ],
    if (negativeCases.contains(
      AdditionalStoriesNegativeCase.duplicateCanonicalId,
    )) ...[
      _relatedItem(
        'Duplicate canonical relation A must not render',
        'duplicate-canonical-a',
        'duplicate-canonical-item',
      ),
      _relatedItem(
        'Duplicate canonical relation B must not render',
        'duplicate-canonical-b',
        'duplicate-canonical-item',
        relationId:
            'related-topic:v1:Reddit:duplicate-canonical-item:rss:anthropic-text-watermarking',
      ),
    ],
    if (negativeCases.contains(AdditionalStoriesNegativeCase.forgedCluster))
      _readerItem(
        'Forged additional cluster must not render',
        'reddit',
        const ['forged-additional-citation'],
        const [
          'reader-card-kind:additional_notable_story',
          'reader-story-cluster:story:cursor-agents',
        ],
        canonicalUrl:
            'https://www.reddit.com/r/fixture/comments/forged-additional/item/',
      ),
    if (negativeCases.contains(AdditionalStoriesNegativeCase.weakUnmarked))
      _readerItem(
        'Weak unrelated Reddit post',
        'reddit',
        const [],
        const [],
        signalScore: 0,
      ),
  ],
  'claimBoard': <Object?>[],
  'reliabilityReport': {
    'mode': 'shadow',
    'policyVersion': 'fixture-v1',
    'riskLevel': 'low',
    'riskScore': 0,
    'risks': <Object?>[],
  },
  'trendDelta': {
    'newSignals': <Object?>[],
    'growingSignals': <Object?>[],
    'repeatedSignals': <Object?>[],
    'fadingSignals': <Object?>[],
  },
  'openQuestions': <Object?>[],
  'risks': <Object?>[],
  'nextActions': <Object?>[],
};

Map<String, Object?> _relatedItem(
  String title,
  String slug,
  String sourceItemId, {
  String cardKind = 'related_topic',
  String? relationId,
  String? url,
  List<Map<String, Object?>> metrics = const [],
}) => _readerItem(
  title,
  'reddit',
  ['$slug-citation'],
  [
    'reader-card-kind:$cardKind',
    'reader-story-cluster:story:$slug',
    'reader-related-topic-relation:${relationId ?? 'related-topic:v1:reddit:$sourceItemId:rss:anthropic-text-watermarking'}',
    'reader-related-topic-target:story:watermark-official',
  ],
  canonicalUrl: url ?? 'https://www.reddit.com/r/fixture/comments/$slug/item/',
  providerMetrics: metrics,
);

Map<String, Object?> _readerItem(
  String title,
  String providerKey,
  List<String> citationIds,
  List<String> markers, {
  List<String>? confirmedProviders,
  List<String> supportProviderKeys = const [],
  List<Map<String, Object?>> providerMetrics = const [],
  String? canonicalUrl,
  num signalScore = 0.5,
  int promotionSlot = 0,
}) {
  final storyMarker = _firstMarker(markers, 'reader-story-cluster:');
  final placement = markers.contains('reader-card-kind:curated_top_read')
      ? 'top'
      : markers.contains('reader-card-kind:additional_notable_story')
      ? 'additional'
      : null;
  final storyClusterId = storyMarker?.substring('reader-story-cluster:'.length);
  final candidateId = citationIds.isEmpty
      ? 'fixture:$title'
      : 'fixture:${citationIds.first}';
  final canonicalIdentity = storyClusterId ?? 'fixture:$title';

  return {
    'title': title,
    'providerKey': providerKey,
    'providerName': providerKey,
    'primaryActionKind': 'read_source',
    'reason': 'Deterministic transport fixture evidence.',
    'matchedInterestIds': <Object?>[],
    'matchedRules': markers,
    'signalScore': signalScore,
    'confidence': {
      'level': 'low',
      'score': 0.4,
      'rationale': 'Deterministic fixture confidence.',
    },
    'confirmedProviderKeys': confirmedProviders ?? [providerKey],
    'providerMetrics': providerMetrics,
    'whyImportant': <Object?>[],
    'whyNow': 'Current fixture window.',
    'citationIds': citationIds,
    'canonicalUrl': ?canonicalUrl,
    if (placement != null && storyClusterId != null)
      'promotionAttestation': additionalStoriesPromotionAttestationFixture(
        candidateId: candidateId,
        canonicalIdentity: canonicalIdentity,
        placement: placement,
        slot: promotionSlot,
        citationIds: citationIds,
        providerKey: providerKey,
        supportProviderKeys: supportProviderKeys,
      ),
  };
}

String? _firstMarker(List<String> markers, String prefix) {
  for (final marker in markers) {
    if (marker.startsWith(prefix)) {
      return marker;
    }
  }
  return null;
}

Map<String, Object?> _emptyTopicMap() => {
  'schemaVersion': 'reader_summary.topic_map.v1',
  'generatedBy': 'deterministic',
  'confidence': {
    'level': 'low',
    'score': 0,
    'rationale': 'No topic map needed for this fixture.',
  },
  'nodes': <Object?>[],
  'groups': <Object?>[],
  'edges': <Object?>[],
  'warnings': <Object?>[],
};

final class _SubjectFixture {
  const _SubjectFixture(this.slug, this.sourceItemId);

  final String slug;
  final String sourceItemId;
}
