import 'package:social_monitor_summaries/src/application/contracts/top_posts_sort_preference_store.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_top_posts_sort_order_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/remember_top_posts_sort_order_use_case.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_promotion_comparator.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';
import 'package:social_monitor_summaries/src/presentation/stores/top_posts_sort_store.dart';

import 'reader_promotion_domain_fixture.dart';
import 'top_posts_test_fixtures.dart';

/// Promoted card titled `Post <slug>` whose signed comparator carries
/// [engagement]; `null` keeps the source engagement unknown.
TopRead engagementTopPost(
  String slug, {
  double? engagement,
  ReaderPostPromotionPlacement placement = ReaderPostPromotionPlacement.top,
  String providerKey = 'reddit',
}) {
  final unranked = placement == ReaderPostPromotionPlacement.news;
  final comparator = ReaderPromotionComparator(
    block: unranked
        ? ReaderPromotionBlock.unranked
        : ReaderPromotionBlock.ranked,
    providerFamily: unranked ? 'rss' : providerKey,
    usefulness: ReaderPromotionUsefulness.useful,
    relevance: ReaderPromotionRelevance.central,
    engagement: engagement == null
        ? null
        : ReaderPromotionEngagement(
            method: ReaderPromotionSignalMethod.redditScore,
            value: engagement,
            observedAt: exactTimestamp('2026-10-28T15:00:00.000000Z'),
          ),
    metricMature: engagement != null,
    popularity: null,
    newsPublisher: null,
    publishedAt: exactTimestamp('2026-10-28T08:00:00.000000Z'),
    candidateId: 'candidate:$slug',
  );
  return topPostFixture(
    title: 'Post $slug',
    storyClusterId: 'story:$slug',
    cardKind: placement.cardKind,
    providerKey: unranked ? 'rss' : providerKey,
    canonicalUrl: 'https://example.test/$slug',
    promotionAttestationOverride: ReaderPostPromotionAttestation(
      schemaVersion: 'reader_post_promotion_attestation.v3',
      candidateId: 'candidate:$slug',
      canonicalIdentity: 'story:$slug',
      placement: placement,
      slot: 1,
      decision: 'promote_${placement.name}',
      comparator: comparator,
    ),
  );
}

/// In-memory stand-in for browser preference storage that survives a
/// simulated page reload when the same instance backs a new store.
final class FakeTopPostsSortPreferenceStore
    implements TopPostsSortPreferenceStore {
  FakeTopPostsSortPreferenceStore([this.saved]);

  TopPostsSortOrder? saved;
  final List<TopPostsSortOrder> saves = [];

  @override
  TopPostsSortOrder? load() => saved;

  @override
  void save(TopPostsSortOrder order) {
    saved = order;
    saves.add(order);
  }
}

TopPostsSortStore topPostsSortStoreFor(
  TopPostsSortPreferenceStore preferences,
) => TopPostsSortStore(
  loadSortOrder: LoadTopPostsSortOrderUseCase(preferences),
  rememberSortOrder: RememberTopPostsSortOrderUseCase(preferences),
);
