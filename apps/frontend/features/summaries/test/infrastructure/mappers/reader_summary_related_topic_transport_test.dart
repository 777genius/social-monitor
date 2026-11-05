import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/reader_summary_content_rest_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/summaries_test_fixtures.dart';
import 'support/reader_summary_additional_stories_transport_fixture.dart';

void main() {
  const restMapper = ReaderSummaryContentRestMapper();
  const summaryMapper = SummaryMapper();
  test('a related-topic card poisons the atomic promotion board', () {
    final summary = summaryMapper.readerSummaryToDomain(
      readerSummaryApiDto(
        id: additionalStoriesTransportArtifactId,
        topStories: const [],
        storyClusterIds: additionalStoriesTransportClusterIds,
        storyClusterAuthorities: additionalStoriesTransportClusterAuthorities,
        citations: additionalStoriesTransportCitations,
        content: restMapper.map(
          additionalStoriesReaderBriefTransportFixture(),
          binding: additionalStoriesTransportBinding,
        ),
        period: additionalStoriesTransportPeriod,
        sourceWindow: additionalStoriesTransportSourceWindow,
      ),
    );
    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
    expect(summary.content.topReads, isEmpty);
    expect(summary.content.selectedPosts, isEmpty);
  });

  test('fails closed for missing, duplicate, dangling, and self targets', () {
    final malformed = [
      additionalStoriesReaderBriefTransportFixture(omitRelationId: true),
      additionalStoriesReaderBriefTransportFixture(duplicateRelationId: true),
      additionalStoriesReaderBriefTransportFixture(
        relatedTarget: 'story:not-present',
      ),
      additionalStoriesReaderBriefTransportFixture(
        relatedTarget: 'story:watermark-reddit-question',
      ),
      additionalStoriesReaderBriefTransportFixture(
        extraRelatedMarkers: const ['reader-related-topic-relation:   '],
      ),
      additionalStoriesReaderBriefTransportFixture(
        extraRelatedMarkers: const [
          ' Reader-Related-Topic-Relation:case-variant',
        ],
      ),
      additionalStoriesReaderBriefTransportFixture(duplicateRelationCard: true),
      additionalStoriesReaderBriefTransportFixture(
        duplicateRelationCard: true,
        duplicateRelationCardKind: 'future_kind',
      ),
      additionalStoriesReaderBriefTransportFixture(caseVariantCardKind: true),
      additionalStoriesReaderBriefTransportFixture(cardKind: 'future_kind'),
      additionalStoriesReaderBriefTransportFixture(
        relationId:
            'RELATED-TOPIC:v1:reddit:reddit-1mt-watermark-code:rss:anthropic-text-watermarking',
      ),
      additionalStoriesReaderBriefTransportFixture(
        relationId:
            'related-topic:V1:reddit:reddit-1mt-watermark-code:rss:anthropic-text-watermarking',
      ),
      additionalStoriesReaderBriefTransportFixture(
        relationId:
            'related-topic:v2:reddit:reddit-1mt-watermark-code:rss:anthropic-text-watermarking',
      ),
      additionalStoriesReaderBriefTransportFixture(
        relationId:
            'related-topic:v1:Reddit:reddit-1mt-watermark-code:rss:anthropic-text-watermarking',
      ),
      additionalStoriesReaderBriefTransportFixture(
        duplicateRelationCard: true,
        duplicateRelationCardRelationId:
            'related-topic:v1:Reddit:reddit-1mt-watermark-code:rss:anthropic-text-watermarking',
      ),
      additionalStoriesReaderBriefTransportFixture(
        relationId: 'related-topic:v1:forged',
      ),
      additionalStoriesReaderBriefTransportFixture(
        relationId:
            'related-topic:v1:reddit:other-subject:rss:anthropic-text-watermarking',
      ),
    ];

    for (final fixture in malformed) {
      final summary = summaryMapper.readerSummaryToDomain(
        readerSummaryApiDto(
          id: additionalStoriesTransportArtifactId,
          topStories: const [],
          storyClusterIds: additionalStoriesTransportClusterIds,
          storyClusterAuthorities: additionalStoriesTransportClusterAuthorities,
          citations: additionalStoriesTransportCitations,
          content: restMapper.map(
            fixture,
            binding: additionalStoriesTransportBinding,
          ),
          period: additionalStoriesTransportPeriod,
          sourceWindow: additionalStoriesTransportSourceWindow,
        ),
      );
      expect(
        summary.content.selectedPosts.where(
          (item) => item.cardKind == ReaderSummaryCardKind.relatedTopic,
        ),
        isEmpty,
      );
      expect(summary.content.headline, 'Transport pipeline fixture');
    }
  });

  test('never treats top stories as related-target cluster authority', () {
    final summary = summaryMapper.readerSummaryToDomain(
      readerSummaryApiDto(
        id: additionalStoriesTransportArtifactId,
        storyClusterIds: const ['story:watermark-reddit-question'],
        storyClusterAuthorities: const [
          ReaderSummaryStoryClusterAuthorityApiDto(
            id: 'story:watermark-reddit-question',
            feedItemIds: ['aug14-watermark-reddit'],
            providerKeys: ['reddit'],
          ),
        ],
        citations: additionalStoriesTransportCitations,
        topStories: const [
          SummaryStoryApiDto(
            storyClusterId: 'story:watermark',
            title: 'Forged authority carrier',
            summary: 'A top story is not the artifact cluster set.',
            topicCount: 1,
            providerCount: 1,
            citationIds: ['fixture'],
          ),
        ],
        content: restMapper.map(
          additionalStoriesReaderBriefTransportFixture(),
          binding: additionalStoriesTransportBinding,
        ),
        period: additionalStoriesTransportPeriod,
        sourceWindow: additionalStoriesTransportSourceWindow,
      ),
    );

    expect(
      summary.content.selectedPosts.where(
        (item) => item.cardKind == ReaderSummaryCardKind.relatedTopic,
      ),
      isEmpty,
    );
  });

  test('fails closed for duplicate citation or cluster authority ids', () {
    final duplicateAuthorityInputs = [
      (
        citations: [
          ...additionalStoriesTransportCitations,
          additionalStoriesTransportCitations.last,
        ],
        authorities: additionalStoriesTransportClusterAuthorities,
      ),
      (
        citations: additionalStoriesTransportCitations,
        authorities: [
          ...additionalStoriesTransportClusterAuthorities,
          additionalStoriesTransportClusterAuthorities.first,
        ],
      ),
    ];

    for (final input in duplicateAuthorityInputs) {
      final summary = summaryMapper.readerSummaryToDomain(
        readerSummaryApiDto(
          id: additionalStoriesTransportArtifactId,
          topStories: const [],
          storyClusterIds: additionalStoriesTransportClusterIds,
          storyClusterAuthorities: input.authorities,
          citations: input.citations,
          content: restMapper.map(
            additionalStoriesReaderBriefTransportFixture(),
            binding: additionalStoriesTransportBinding,
          ),
          period: additionalStoriesTransportPeriod,
          sourceWindow: additionalStoriesTransportSourceWindow,
        ),
      );

      expect(
        summary.content.selectedPosts.where(
          (item) => item.cardKind == ReaderSummaryCardKind.relatedTopic,
        ),
        isEmpty,
      );
    }
  });

  test('keeps contextual relations out of promotion lanes', () {
    final summary = summaryMapper.readerSummaryToDomain(
      readerSummaryApiDto(
        id: additionalStoriesTransportArtifactId,
        topStories: const [],
        storyClusterIds: additionalStoriesTransportClusterIds,
        storyClusterAuthorities: additionalStoriesTransportClusterAuthorities,
        citations: additionalStoriesTransportCitations,
        content: restMapper.map(
          additionalStoriesReaderBriefTransportFixture(),
          binding: additionalStoriesTransportBinding,
        ),
        period: additionalStoriesTransportPeriod,
        sourceWindow: additionalStoriesTransportSourceWindow,
      ),
    );
    final projection = readerSummaryTopPostsProjection(summary);
    expect(
      projection.additionalNotableStories
          .where((item) => item.cardKind == ReaderSummaryCardKind.relatedTopic)
          .map((item) => item.storyClusterId),
      isEmpty,
    );
  });
}
