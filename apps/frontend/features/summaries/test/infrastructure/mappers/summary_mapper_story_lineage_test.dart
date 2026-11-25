import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  test('preserves story cluster lineage for additional story projection', () {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        topStories: const [
          SummaryStoryApiDto(
            storyClusterId: 'story:cursor-agents',
            title: 'Cursor background agents',
            summary: 'HN and X citations describe the same launch.',
            topicCount: 1,
            providerCount: 2,
            interestIds: ['developer-tools'],
            providerKeys: ['hacker-news', 'x-twitter'],
            citationIds: ['cursor-hn', 'cursor-x'],
          ),
        ],
      ),
    );

    expect(summary.topStories.single.storyClusterId, 'story:cursor-agents');
    expect(summary.topStories.single.providerKeys, [
      'hacker-news',
      'x-twitter',
    ]);
    expect(summary.topStories.single.citationIds, ['cursor-hn', 'cursor-x']);
  });
}
