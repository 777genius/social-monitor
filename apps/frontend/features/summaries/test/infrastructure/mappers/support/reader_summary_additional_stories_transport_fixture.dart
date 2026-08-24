import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/reader_summary_artifact_binding.dart';

import '../../../../integration_test/support/promotion_attestation_rest_fixture.dart';

const additionalStoriesTransportArtifactId = 'fixture-artifact';
const additionalStoriesTransportSourceWindowId = 'fixture-window';
final additionalStoriesTransportPeriod = SummaryPeriodApiDto(
  cadence: 'daily',
  startedAt: DateTime.utc(2026, 8, 18),
  endedAt: DateTime.utc(2026, 8, 19),
  timezone: 'UTC',
  periodKey: 'daily:2026-08-18T00:00:00.000Z:2026-08-19T00:00:00.000Z:UTC',
);
final additionalStoriesTransportSourceWindow = SummaryWindowApiDto(
  id: additionalStoriesTransportSourceWindowId,
  label: 'Fixture evidence window',
  startedAt: DateTime.utc(2026, 8, 18),
  endedAt: DateTime.utc(2026, 8, 19),
  ingestionCutoff: DateTime.utc(2026, 8, 18, 23),
);
final additionalStoriesTransportBinding = ReaderSummaryArtifactBinding(
  artifactId: additionalStoriesTransportArtifactId,
  sourceWindowId: additionalStoriesTransportSourceWindowId,
  periodStart: additionalStoriesTransportPeriod.startedAt,
  periodEnd: additionalStoriesTransportPeriod.endedAt,
  ingestionCutoff: additionalStoriesTransportSourceWindow.ingestionCutoff,
);

const additionalStoriesTransportClusterIds = [
  'story:cursor-agents',
  'story:watermark',
  'story:watermark-reddit-question',
];

const additionalStoriesTransportCitations = [
  SummaryCitationApiDto(
    id: 'cursor-hn',
    sourceLabel: 'Hacker News fixture',
    rawSnippet: 'Cursor background agents discussion.',
    feedItemId: 'aug14-cursor-hn',
    sourceItemId: 'cursor-background-agents-hn',
    providerKey: 'hacker-news',
    canonicalUrl: 'https://news.ycombinator.com/item?id=456',
  ),
  SummaryCitationApiDto(
    id: 'cursor-x',
    sourceLabel: 'X fixture',
    rawSnippet: 'Cursor background agents announcement.',
    feedItemId: 'aug14-cursor-x',
    sourceItemId: 'cursor-background-agents-x',
    providerKey: 'x-twitter',
    canonicalUrl: 'https://x.com/cursor/status/123',
  ),
  SummaryCitationApiDto(
    id: 'watermark-hn',
    sourceLabel: 'Hacker News fixture',
    rawSnippet: 'Text watermarking discussion.',
    feedItemId: 'aug14-watermark-hn',
    sourceItemId: 'anthropic-text-watermarking-hn',
    providerKey: 'hacker-news',
    canonicalUrl: 'https://news.ycombinator.com/item?id=789',
  ),
  SummaryCitationApiDto(
    id: 'watermark-official',
    sourceLabel: 'Official fixture',
    rawSnippet: 'Official text-watermarking publication.',
    feedItemId: 'aug14-watermark-official',
    sourceItemId: 'anthropic-text-watermarking',
    providerKey: 'rss',
    canonicalUrl: 'https://official.example.test/watermarking',
  ),
  SummaryCitationApiDto(
    id: 'watermark-reddit',
    sourceLabel: 'Reddit fixture',
    rawSnippet: 'A question about generated-code watermarks.',
    feedItemId: 'aug14-watermark-reddit',
    sourceItemId: 'reddit-1mt-watermark-code',
    providerKey: 'reddit',
    canonicalUrl:
        'https://www.reddit.com/r/ClaudeAI/comments/1mtwatermark/does_claude_code_leave_watermarks_inside_codes/',
  ),
];

const additionalStoriesTransportClusterAuthorities = [
  ReaderSummaryStoryClusterAuthorityApiDto(
    id: 'story:cursor-agents',
    feedItemIds: ['aug14-cursor-hn', 'aug14-cursor-x'],
    providerKeys: ['hacker-news', 'x-twitter'],
  ),
  ReaderSummaryStoryClusterAuthorityApiDto(
    id: 'story:watermark-reddit-question',
    feedItemIds: ['aug14-watermark-reddit'],
    providerKeys: ['reddit'],
  ),
  ReaderSummaryStoryClusterAuthorityApiDto(
    id: 'story:watermark',
    feedItemIds: ['aug14-watermark-official', 'aug14-watermark-hn'],
    providerKeys: ['rss', 'hacker-news'],
  ),
];

generated.ReaderSummaryReaderBriefDto
additionalStoriesReaderBriefTransportFixture({
  String relatedTarget = 'story:watermark',
  bool omitRelationId = false,
  bool duplicateRelationId = false,
  List<String> extraRelatedMarkers = const [],
  bool duplicateRelationCard = false,
  String? duplicateRelationCardRelationId,
  String duplicateRelationCardKind = 'related_topic',
  String? cardKind,
  bool caseVariantCardKind = false,
  String relationId =
      'related-topic:v1:reddit:reddit-1mt-watermark-code:rss:anthropic-text-watermarking',
}) => generated.ReaderSummaryReaderBriefDto.fromJson({
  'headline': 'Transport pipeline fixture',
  'oneLineTakeaway': 'Explicit Additional stories coexist with legacy cards.',
  'bullets': <Object?>[],
  'narrativeSections': <Object?>[],
  'mainTopics': <Object?>[],
  'topicMap': {
    'schemaVersion': 'reader_summary.topic_map.v1',
    'generatedBy': 'deterministic',
    'confidence': {
      'level': 'low',
      'score': 0.4,
      'rationale': 'Fixture topic map.',
    },
    'nodes': <Object?>[],
    'groups': <Object?>[],
    'edges': <Object?>[],
    'warnings': <Object?>[],
  },
  'qualityState': {
    'status': 'ready',
    'flags': <Object?>[],
    'warnings': <Object?>[],
    'isSingleSource': false,
  },
  'interestSections': <Object?>[],
  'sourceMix': <Object?>[],
  'topReads': [
    _rawReaderItem(
      title: 'Legacy editorial read',
      providerKey: 'hacker-news',
      citationIds: const ['legacy-top-read'],
      markers: const [
        'reader-card-kind:curated_top_read',
        'reader-story-cluster:story:legacy-editorial-read',
      ],
      promotionSlot: 0,
    ),
  ],
  'selectedPosts': [
    _rawReaderItem(
      title: 'Cursor background agents launch',
      providerKey: 'hacker-news',
      citationIds: const ['cursor-hn', 'cursor-x'],
      markers: const [
        'reader-card-kind:additional_notable_story',
        'reader-story-cluster:story:cursor-agents',
      ],
      promotionSlot: 0,
    ),
    _rawReaderItem(
      title: 'Official watermark standard ships',
      providerKey: 'rss',
      citationIds: const ['watermark-official', 'watermark-hn'],
      markers: const [
        'reader-card-kind:additional_notable_story',
        'reader-story-cluster:story:watermark',
      ],
      promotionSlot: 1,
    ),
    _rawReaderItem(
      title: 'Does Claude Code leave watermarks inside codes?',
      providerKey: 'reddit',
      citationIds: const ['watermark-reddit'],
      canonicalUrl:
          'https://www.reddit.com/r/ClaudeAI/comments/1mtwatermark/does_claude_code_leave_watermarks_inside_codes/',
      markers: [
        'reader-card-kind:${cardKind ?? (caseVariantCardKind ? 'RELATED_TOPIC' : 'related_topic')}',
        'reader-story-cluster:story:watermark-reddit-question',
        if (!omitRelationId) 'reader-related-topic-relation:$relationId',
        if (duplicateRelationId)
          'reader-related-topic-relation:forged-duplicate',
        'reader-related-topic-target:$relatedTarget',
        ...extraRelatedMarkers,
      ],
      providerMetrics: const [
        {'label': 'Score', 'value': '7'},
        {'label': 'Comments', 'value': '5'},
      ],
    ),
    if (duplicateRelationCard)
      _rawReaderItem(
        title: 'Second related discussion fixture',
        providerKey: 'reddit',
        citationIds: const ['watermark-reddit'],
        canonicalUrl:
            'https://www.reddit.com/r/ClaudeAI/comments/1mtwatermark/does_claude_code_leave_watermarks_inside_codes/',
        markers: [
          'reader-card-kind:$duplicateRelationCardKind',
          'reader-story-cluster:story:watermark-reddit-question',
          'reader-related-topic-relation:${duplicateRelationCardRelationId ?? relationId}',
          'reader-related-topic-target:$relatedTarget',
        ],
      ),
    for (var rank = 1; rank <= 10; rank += 1)
      _rawReaderItem(
        title: 'fixture-labs/transport-repo-$rank',
        providerKey: 'github-trending-page',
        citationIds: ['legacy-github-$rank'],
        canonicalUrl: 'https://github.com/fixture-labs/transport-repo-$rank',
        markers: [
          'reader-card-kind:supplemental_trend',
          'reader-story-cluster:'
              'supplemental:github-trending-page:transport-repo-$rank',
        ],
        providerMetrics: [
          {
            'label': 'GitHub Trending today',
            'value': '#$rank, +${1100 - rank * 50} stars today',
          },
        ],
      ),
    _rawReaderItem(
      title: 'Which editor should I use for agents?',
      providerKey: 'reddit',
      citationIds: const ['weak-reddit'],
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
});

Map<String, Object?> _rawReaderItem({
  required String title,
  required String providerKey,
  required List<String> citationIds,
  List<String> markers = const [],
  List<Map<String, Object?>> providerMetrics = const [],
  String? canonicalUrl,
  int? promotionSlot,
}) {
  final storyClusterId = _markerValue(markers, 'reader-story-cluster:');
  final placement = markers.contains('reader-card-kind:curated_top_read')
      ? 'top'
      : markers.contains('reader-card-kind:additional_notable_story')
      ? 'additional'
      : null;
  return {
    'title': title,
    'providerKey': providerKey,
    'providerName': providerKey,
    'primaryActionKind': 'read_source',
    'reason': 'Transport fixture evidence.',
    'matchedInterestIds': <Object?>[],
    'matchedRules': markers,
    'signalScore': 0.5,
    'confidence': {
      'level': 'low',
      'score': 0.4,
      'rationale': 'Fixture confidence.',
    },
    'confirmedProviderKeys': <Object?>[providerKey],
    'providerMetrics': providerMetrics,
    'whyImportant': <Object?>[],
    'whyNow': 'Current fixture window.',
    'citationIds': citationIds,
    'canonicalUrl': ?canonicalUrl,
    if (placement != null && storyClusterId != null)
      'promotionAttestation': promotionAttestationRestFixture(
        candidateId: 'fixture:${citationIds.first}',
        canonicalIdentity: storyClusterId,
        placement: placement,
        slot: promotionSlot ?? 0,
        citationIds: citationIds,
        providerKey: providerKey,
      ),
  };
}

String? _markerValue(List<String> markers, String prefix) {
  for (final marker in markers) {
    if (marker.startsWith(prefix)) {
      return marker.substring(prefix.length);
    }
  }
  return null;
}
