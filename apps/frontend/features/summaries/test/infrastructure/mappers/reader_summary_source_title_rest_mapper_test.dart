import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/generated_summary_rest_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/reader_post_promotion_attestation_rest_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/reader_summary_artifact_binding.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/reader_summary_content_rest_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import '../../support/summaries_test_fixtures.dart';
import 'support/reader_summary_additional_stories_transport_fixture.dart';
import 'support/reader_summary_source_title_rest_fixture.dart';

void main() {
  test(
    'keeps a generated source-title V2 card after REST mapping',
    () {
      final rest = generated.ReaderSummaryReaderBriefDto.fromJson(
        sourceTitleReaderBriefJson(),
      );
      final summary = const SummaryMapper().readerSummaryToDomain(
        readerSummaryApiDto(
          id: 'artifact-1',
          bindPromotionAttestations: false,
          topStories: const [],
          storyClusterIds: const ['cluster:release'],
          storyClusterAuthorities: const [
            ReaderSummaryStoryClusterAuthorityApiDto(
              id: 'cluster:release',
              feedItemIds: ['candidate-top'],
              providerKeys: ['hacker-news'],
            ),
          ],
          citations: const [
            SummaryCitationApiDto(
              id: 'citation-1',
              sourceLabel: 'Hacker News fixture',
              rawSnippet: 'Runtime regression discussion.',
              feedItemId: 'candidate-top',
              sourceItemId: 'source-top',
              providerKey: 'hacker-news',
              canonicalUrl: 'https://news.ycombinator.com/item?id=456',
            ),
          ],
          period: additionalStoriesTransportPeriod,
          sourceWindow: SummaryWindowApiDto(
            id: 'window-1',
            label: 'Fixture evidence window',
            startedAt: DateTime.utc(2026, 8, 18),
            endedAt: DateTime.utc(2026, 8, 19),
            ingestionCutoff: DateTime.utc(2026, 8, 18, 23),
          ),
          content: const ReaderSummaryContentRestMapper().map(
            rest,
            binding: ReaderSummaryArtifactBinding(
              artifactId: 'artifact-1',
              sourceWindowId: 'window-1',
              periodStart: additionalStoriesTransportPeriod.startedAt,
              periodEnd: additionalStoriesTransportPeriod.endedAt,
              ingestionCutoff: DateTime.utc(2026, 8, 18, 23),
              feedItemIdsByCitation: const {'citation-1': 'candidate-top'},
              sourceItemIdsByCitation: const {'citation-1': 'source-top'},
            ),
          ),
        ),
      );

      expect(
        summary.content.promotionBoardAvailability,
        ReaderSummaryPromotionBoardAvailability.available,
      );
      expect(summary.content.topReads, hasLength(1));
      expect(summary.content.topReads.single.title, sourceTitleCardTitle);
      expect(summary.content.topReads.single.displayHeadline, isNull);
      expect(
        summary.content.topReads.single.capturedSource?.body,
        sourceTitleCardBody,
      );
      expect(summary.content.topReads.single.promotionAttestation, isNotNull);
    },
  );

  test(
    'maps generated source-title V2 DTO through the production attestation mapper',
    () {
      final item = generated.ReaderSummaryReaderItemDto.fromJson(
        sourceTitleTopReadJson(),
      );

      expect(
        mapReaderPostPromotionAttestation(
          item.promotionAttestation,
          displayHeadline: displayJson(item.toJson()['displayHeadline']),
          capturedSource: displayJson(item.toJson()['capturedSource']),
          cardTitle: item.title,
          cardProviderKey: item.providerKey,
          cardStoryClusterId: 'cluster:release',
          cardPublishedAt: DateTime.parse('2026-08-18T10:00:00.000Z'),
          cardCitationIds: item.citationIds,
          enclosingArtifactId: 'artifact-1',
          enclosingSourceWindowId: 'window-1',
          enclosingPeriodStart: DateTime.parse('2026-08-18T00:00:00.000Z'),
          enclosingPeriodEnd: DateTime.parse('2026-08-19T00:00:00.000Z'),
          enclosingIngestionCutoff: DateTime.parse('2026-08-18T23:00:00.000Z'),
          enclosingExactIngestionCutoff: null,
        ),
        isNotNull,
      );
    },
  );

  test(
    'keeps a source-title V2 board through the generated artifact mapper',
    () {
      final serialized = jsonEncode(sourceTitleArtifactResponseDto().toJson());
      final response = generated.ReaderSummaryArtifactResponseDto.fromJson(
        jsonDecode(serialized) as Map<String, dynamic>,
      );
      final summary = const SummaryMapper().readerSummaryToDomain(
        const GeneratedSummaryRestMapper().readerSummary(response),
      );

      expect(
        summary.content.promotionBoardAvailability,
        ReaderSummaryPromotionBoardAvailability.available,
      );
      expect(summary.content.topReads, hasLength(1));
      expect(summary.content.topReads.single.title, sourceTitleCardTitle);
      expect(summary.content.topReads.single.displayHeadline, isNull);
      expect(
        summary.content.topReads.single.capturedSource?.body,
        sourceTitleCardBody,
      );
      expect(summary.content.topReads.single.promotionAttestation, isNotNull);
    },
  );
}
