import 'dart:convert';

import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/reader_summary_content_rest_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import '../infrastructure/mappers/support/reader_summary_additional_stories_transport_fixture.dart';
import '../../integration_test/support/promotion_attestation_rest_fixture.dart';
import 'summaries_test_fixtures.dart';

ReaderSummary sourceReasonRestSummary(String source, {String? editorial}) {
  final json =
      jsonDecode(jsonEncode(additionalStoriesReaderBriefTransportFixture()))
          as Map<String, dynamic>;
  json['topReads'] = <Object?>[];
  json['selectedPosts'] = [
    {
      'title': source,
      'providerKey': 'hacker-news',
      'providerName': 'Hacker News',
      'primaryActionKind': 'read_source',
      'reason': 'Source-reported: $source',
      'whyImportant': [
        if (editorial != null) editorial,
        'Source-reported: $source',
      ],
      'whyNow': 'Current synthetic window',
      'matchedInterestIds': <Object?>[],
      'matchedRules': [
        'reader-card-kind:additional_notable_story',
        'reader-story-cluster:story:cursor-agents',
      ],
      'signalScore': 0.5,
      'confidence': {
        'level': 'low',
        'score': 0.4,
        'rationale': 'Synthetic source',
      },
      'confirmedProviderKeys': ['hacker-news'],
      'providerMetrics': <Object?>[],
      'citationIds': ['cursor-hn'],
      'canonicalUrl': 'https://news.ycombinator.com/item?id=456',
      'promotionAttestation': promotionAttestationRestFixture(
        candidateId: 'fixture:cursor-hn',
        canonicalIdentity: 'story:cursor-agents',
        placement: 'additional',
        citationIds: ['cursor-hn'],
        providerKey: 'hacker-news',
      ),
    },
  ];
  // Exercise generated REST decoding and both production mapping boundaries.
  final rest = generated.ReaderSummaryReaderBriefDto.fromJson(json);
  return const SummaryMapper().readerSummaryToDomain(
    readerSummaryApiDto(
      id: additionalStoriesTransportArtifactId,
      bindPromotionAttestations: false,
      topStories: const [],
      storyClusterIds: additionalStoriesTransportClusterIds,
      storyClusterAuthorities: additionalStoriesTransportClusterAuthorities,
      citations: additionalStoriesTransportCitations,
      period: additionalStoriesTransportPeriod,
      sourceWindow: additionalStoriesTransportSourceWindow,
      content: const ReaderSummaryContentRestMapper().map(
        rest,
        binding: additionalStoriesTransportBinding,
      ),
    ),
  );
}
