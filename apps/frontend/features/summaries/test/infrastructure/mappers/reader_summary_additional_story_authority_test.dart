import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/generated_summary_rest_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../../integration_test/infrastructure/mappers/support/additional_stories_e2e_rest_boundary.dart';
import '../../../integration_test/support/additional_stories_test_scenarios.dart';

void main() {
  const restMapper = GeneratedSummaryRestMapper();
  const domainMapper = SummaryMapper();

  for (final negativeCase in AdditionalStoriesNegativeCase.values) {
    test('fails closed for only ${negativeCase.name}', () {
      final apiSummary = restMapper.readerSummary(
        additionalStoriesRestFixture(negativeCases: {negativeCase}),
      );
      final summary = domainMapper.readerSummaryToDomain(apiSummary);
      final projection = readerSummaryTopPostsProjection(summary);

      expect(
        summary.content.headline,
        'Additional stories integration fixture',
      );
      expect(
        summary.content.promotionBoardAvailability,
        ReaderSummaryPromotionBoardAvailability.unavailable,
      );
      expect(projection.items, isEmpty);
      expect(summary.content.topReads, isEmpty);
      expect(summary.content.selectedPosts, isEmpty);
    });
  }

  test('fails all cluster cards closed when feed membership overlaps', () {
    final payload =
        jsonDecode(jsonEncode(additionalStoriesRestFixture().toJson()))
            as Map<String, dynamic>;
    final clusters = (payload['storyClusters']! as List<dynamic>)
        .cast<Map<String, dynamic>>();
    clusters[1]['duplicateFeedItemIds'] = [
      ...(clusters[1]['duplicateFeedItemIds']! as List<dynamic>),
      'feed-watermark-official',
    ];

    final apiSummary = restMapper.readerSummary(
      generated.ReaderSummaryArtifactResponseDto.fromJson(payload),
    );
    final summary = domainMapper.readerSummaryToDomain(apiSummary);
    final projection = readerSummaryTopPostsProjection(summary);

    expect(projection.curatedPosts, isEmpty);
    expect(projection.additionalNotableStories, isEmpty);
  });
}
