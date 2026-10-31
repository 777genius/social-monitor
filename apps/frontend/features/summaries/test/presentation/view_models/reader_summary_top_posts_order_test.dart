import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_order.dart';

import '../../support/top_posts_sort_test_fixtures.dart';
import '../../support/top_posts_test_fixtures.dart';

void main() {
  final lane = List<TopRead>.unmodifiable([
    engagementTopPost('a', engagement: 10),
    engagementTopPost('b'),
    engagementTopPost('c', engagement: 50),
    engagementTopPost('d', engagement: 10),
    engagementTopPost('e'),
    engagementTopPost('f', engagement: 0),
  ]);

  List<String> titles(List<TopRead> items) => [
    for (final item in items) item.title,
  ];

  test('model rank keeps the authorized lane untouched', () {
    expect(
      readerSummaryTopPostsInOrder(lane, TopPostsSortOrder.modelRank),
      same(lane),
    );
  });

  test('likes order is descending, stable on ties, unknown metrics last', () {
    final ordered = readerSummaryTopPostsInOrder(
      lane,
      TopPostsSortOrder.engagement,
    );

    expect(titles(ordered), [
      'Post c',
      'Post a', // 10 ties with d: model order wins
      'Post d',
      'Post f', // a measured 0 still beats an unknown metric
      'Post b', // unknown metrics keep their model order
      'Post e',
    ]);
    expect(titles(lane).first, 'Post a', reason: 'input lane is not mutated');
    expect(() => ordered.add(lane.first), throwsUnsupportedError);
  });

  test('a lane without any metric keeps the model order', () {
    final unknown = [engagementTopPost('x'), engagementTopPost('y')];

    expect(
      titles(
        readerSummaryTopPostsInOrder(unknown, TopPostsSortOrder.engagement),
      ),
      ['Post x', 'Post y'],
    );
  });

  test('engagement comes only from the signed comparator, not card text', () {
    final legacy = topPostFixture(
      title: 'Legacy card with a big card metric',
      storyClusterId: 'story:legacy',
      cardKind: ReaderSummaryCardKind.curatedTopRead,
      providerMetrics: const [ProviderMetric(label: 'Score', value: '99,999')],
    );

    expect(readerSummaryTopPostEngagement(legacy), isNull);
    expect(
      readerSummaryTopPostEngagement(engagementTopPost('v3', engagement: 7.5)),
      7.5,
    );
  });
}
