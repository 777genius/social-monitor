import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_order.dart';

import '../../support/top_posts_sort_test_fixtures.dart';
import '../../support/top_posts_test_fixtures.dart';

void main() {
  List<String> likesOrder(List<TopRead> items) => [
    for (final item in readerSummaryTopPostsInOrder(
      items,
      TopPostsSortOrder.engagement,
    ))
      item.title,
  ];

  test(
    'actual X likes beat repost-weighted engagement without changing Model',
    () {
      final repostHeavy = engagementTopPost(
        'reposts',
        providerKey: 'x-twitter',
        nativeLikes: 12,
        engagement: 2012,
      );
      final liked = engagementTopPost(
        'likes',
        providerKey: 'x-twitter',
        nativeLikes: 56,
        engagement: 56,
      );
      final modelPool = [repostHeavy, liked];

      expect(readerSummaryTopPostEngagement(repostHeavy), 12);
      expect(likesOrder(modelPool), ['Post likes', 'Post reposts']);
      expect(
        readerSummaryTopPostsInOrder(modelPool, TopPostsSortOrder.modelRank),
        same(modelPool),
      );
      expect(
        repostHeavy.promotionAttestation!.comparator!.engagement!.value,
        2012,
      );
    },
  );

  test('equal X likes use recency then identity, never model or reposts', () {
    final old = engagementTopPost(
      'old',
      providerKey: 'x-twitter',
      nativeLikes: 20,
      engagement: 2020,
      publishedAt: '2026-10-28T08:00:00.000000Z',
    );
    final recent = engagementTopPost(
      'recent',
      providerKey: 'x-twitter',
      nativeLikes: 20,
      engagement: 20,
      publishedAt: '2026-10-28T08:00:00.000001Z',
    );
    expect(likesOrder([old, recent]), ['Post recent', 'Post old']);
    expect(likesOrder([recent, old]), ['Post recent', 'Post old']);

    final z = engagementTopPost(
      'z-reposts',
      providerKey: 'x-twitter',
      nativeLikes: 20,
      engagement: 2020,
    );
    final a = engagementTopPost(
      'a-likes',
      providerKey: 'x-twitter',
      nativeLikes: 20,
      engagement: 20,
    );
    expect(likesOrder([z, a]), ['Post a-likes', 'Post z-reposts']);
    expect(likesOrder([a, z]), ['Post a-likes', 'Post z-reposts']);
  });

  test('missing X likes never fall back to weighted engagement or Signal', () {
    final unknown = engagementTopPost(
      'weighted-only',
      providerKey: 'x-twitter',
      engagement: 99999,
    );
    final zero = engagementTopPost(
      'zero',
      providerKey: 'x-twitter',
      nativeLikes: 0,
      engagement: 0,
    );
    final recentUnknown = engagementTopPost(
      'new-unknown',
      providerKey: 'x-twitter',
      engagement: 1,
      publishedAt: '2026-10-28T09:00:00.000000Z',
    );

    expect(readerSummaryTopPostEngagement(unknown), isNull);
    expect(likesOrder([unknown, recentUnknown, zero]), [
      'Post zero',
      'Post new-unknown',
      'Post weighted-only',
    ]);
  });

  test(
    'only exact native Like labels and full integer counts are eligible',
    () {
      TopRead nativeMetrics(List<ProviderMetric> metrics) => topPostFixture(
        title: 'Native counts',
        providerKey: 'x-twitter',
        storyClusterId: 'story:native',
        cardKind: ReaderSummaryCardKind.curatedTopRead,
        providerMetrics: metrics,
        signalScore: 999,
      );
      expect(
        readerSummaryTopPostEngagement(
          nativeMetrics(const [
            ProviderMetric(label: 'Likes', value: '12,345'),
            ProviderMetric(label: 'Reposts', value: '99999'),
          ]),
        ),
        12345,
      );
      for (final metric in const [
        ProviderMetric(label: 'Likes + 2× reposts', value: '99999'),
        ProviderMetric(label: 'Reposts', value: '99999'),
        ProviderMetric(label: 'Likes', value: '1.2K'),
        ProviderMetric(label: 'Likes', value: '-1'),
        ProviderMetric(label: 'Likes', value: '1.5'),
        ProviderMetric(label: 'Likes', value: '12,34'),
        ProviderMetric(label: 'Likes', value: '9007199254740992'),
      ]) {
        expect(readerSummaryTopPostEngagement(nativeMetrics([metric])), isNull);
      }
      expect(
        readerSummaryTopPostEngagement(
          nativeMetrics(const [
            ProviderMetric(label: 'Likes', value: '12'),
            ProviderMetric(label: 'Likes', value: '13'),
          ]),
        ),
        isNull,
      );
    },
  );
}
