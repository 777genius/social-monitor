import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/reader_summary_content_rest_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/summaries_test_fixtures.dart';
import 'support/reader_summary_additional_stories_transport_fixture.dart';

void main() {
  test('rejects a markerless top read despite canonical cluster authority', () {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        topStories: const [],
        content: readerSummaryContentApiDto(
          topReads: const [
            TopReadApiDto(
              storyClusterId: 'story:canonical-legacy',
              title: 'Canonical markerless legacy top read',
              providerKey: 'github-repo-radar',
              reason: 'The canonical citation authorizes cluster membership.',
              confirmedProviderKeys: ['github-repo-radar'],
              canonicalUrl: 'https://github.com/example/ai-coding-tools',
              citationIds: ['bc-1'],
            ),
          ],
          selectedPosts: const [],
        ),
      ),
    );

    expect(summary.content.topReads, isEmpty);
    expect(readerSummaryTopPostsProjection(summary).curatedPosts, isEmpty);
  });

  test(
    'rejects unmarked legacy top reads and explicit cards without authority',
    () {
      const mapper = SummaryMapper();
      const restMapper = ReaderSummaryContentRestMapper();
      final summary = mapper.readerSummaryToDomain(
        readerSummaryApiDto(
          id: additionalStoriesTransportArtifactId,
          topStories: const [],
          storyClusterIds: additionalStoriesTransportClusterIds,
          content: restMapper.map(
            additionalStoriesReaderBriefTransportFixture(),
            binding: additionalStoriesTransportBinding,
          ),
          period: additionalStoriesTransportPeriod,
          sourceWindow: additionalStoriesTransportSourceWindow,
        ),
      );

      final projection = readerSummaryTopPostsProjection(summary);

      expect(summary.topStories, isEmpty);
      expect(summary.content.topReads, isEmpty);
      expect(projection.curatedPosts, isEmpty);
      expect(projection.additionalNotableStories, isEmpty);
      expect(
        projection.items.map((item) => item.title),
        isNot(contains('Which editor should I use for agents?')),
      );
    },
  );

  test('requires both explicit Additional kind and a story cluster marker', () {
    const mapper = SummaryMapper();
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        topStories: const [],
        content: readerSummaryContentApiDto(
          topReads: const [],
          selectedPosts: const [
            TopReadApiDto(
              cardKind: 'additional_notable_story',
              title: 'Unclustered item',
              providerKey: 'reddit',
              reason: 'Kind without a cluster is insufficient.',
              citationIds: ['unclustered'],
            ),
            TopReadApiDto(
              storyClusterId: 'story:unmarked-kind',
              title: 'Cluster without an Additional kind',
              providerKey: 'reddit',
              reason: 'Cluster without the kind is insufficient.',
              citationIds: ['unmarked-kind'],
            ),
          ],
        ),
      ),
    );

    expect(
      readerSummaryTopPostsProjection(summary).additionalNotableStories,
      isEmpty,
    );
  });

  test('fails every unmarked legacy selectedPost closed', () {
    const mapper = SummaryMapper();
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        topStories: const [],
        content: readerSummaryContentApiDto(
          topReads: const [],
          selectedPosts: const [
            TopReadApiDto(
              title: 'Unmarked legacy GitHub item',
              providerKey: 'github-trending-page',
              reason: 'No explicit classification marker.',
              citationIds: ['legacy-github'],
            ),
          ],
        ),
      ),
    );

    expect(summary.content.selectedPosts, isEmpty);
    expect(readerSummaryTopPostsProjection(summary).items, isEmpty);
  });
}
