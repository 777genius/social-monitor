import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_ranked_posts_display.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/top_posts_sort_test_fixtures.dart';
import '../../support/top_posts_test_fixtures.dart';

void main() {
  test('orders the full selected pool before each twelve-card reveal', () {
    final projection = readerSummaryTopPostsProjection(
      topPostsSummaryFixture(
        topReads: [
          for (var i = 0; i < 12; i++)
            engagementTopPost('top-$i', engagement: i.toDouble()),
        ],
        selectedPosts: [
          for (var i = 0; i < 25; i++)
            engagementTopPost(
              'extra-$i',
              engagement: (100 + i).toDouble(),
              providerKey: 'x-twitter',
              nativeLikes: 100 + i,
              placement: ReaderPostPromotionPlacement.additional,
            ),
        ],
        newsWithoutRatingPosts: [
          engagementTopPost(
            'news',
            engagement: 10000,
            placement: ReaderPostPromotionPlacement.news,
          ),
        ],
      ),
    );
    ReaderSummaryRankedPostsDisplay page(int revealed, {bool hideX = false}) =>
        ReaderSummaryRankedPostsDisplay(
          projection: projection,
          additionalVisibleCount: revealed,
          sortOrder: TopPostsSortOrder.engagement,
          hiddenProviders: {if (hideX) 'x-twitter'},
        );

    final first = page(0);
    expect(first.items.length, 12);
    expect(first.items.first.title, 'Post extra-24');
    expect(first.items.last.title, 'Post extra-13');
    expect(first.availableCount, 37);
    expect(first.remainingCount, 25);
    expect(page(12).items.length, 24);
    expect(page(24).items.length, 36);
    expect(page(36).items.length, 37);
    expect(page(36).remainingCount, 0);
    expect(page(36).showRevealControl, isTrue);
    expect(page(0, hideX: true).items.length, 12);
    expect(page(0, hideX: true).remainingCount, 0);
    expect(page(0, hideX: true).showRevealControl, isFalse);
    expect(page(36).items.any((item) => item.title == 'Post news'), isFalse);
    expect(projection.curatedPosts.first.title, 'Post top-0');
  });
}
