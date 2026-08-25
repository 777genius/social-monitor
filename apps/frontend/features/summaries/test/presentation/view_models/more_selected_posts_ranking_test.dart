import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/more_selected_posts_ranking.dart';

import '../../support/top_posts_test_fixtures.dart';

void main() {
  test('uses normalized Signal as the primary usefulness criterion', () {
    final strongerSupport = topPostFixture(
      title: 'Stronger support',
      signalScore: 1.5,
      confidenceLevel: 'high',
      confidenceScore: 0.95,
      confirmedProviderKeys: const ['reddit', 'hacker-news'],
      matchedInterestIds: const ['ai', 'dart'],
    );
    final strongerSignal = topPostFixture(
      title: 'Stronger signal',
      signalScore: 1.6,
      confidenceLevel: 'low',
      confidenceScore: 0.2,
    );

    expect(
      _titles(
        orderMoreSelectedPostsByUsefulness([strongerSupport, strongerSignal]),
      ),
      ['Stronger signal', 'Stronger support'],
    );
  });

  test('breaks Signal ties with evidence quality and matched interests', () {
    final items = [
      topPostFixture(title: 'Stable first'),
      topPostFixture(title: 'Stable second'),
      topPostFixture(
        title: 'More interests',
        matchedInterestIds: const ['ai', 'dart'],
      ),
      topPostFixture(title: 'Higher confidence score', confidenceScore: 0.8),
      topPostFixture(title: 'High confidence', confidenceLevel: 'high'),
      topPostFixture(
        title: 'Independent support',
        confidenceLevel: 'low',
        confirmedProviderKeys: const ['reddit', 'hacker-news'],
      ),
    ];

    expect(_titles(orderMoreSelectedPostsByUsefulness(items)), [
      'Independent support',
      'High confidence',
      'Higher confidence score',
      'More interests',
      'Stable first',
      'Stable second',
    ]);
  });

  test('does not compare provider-native engagement across sources', () {
    final first = topPostFixture(
      title: 'Reddit item',
      providerMetrics: const [ProviderMetric(label: 'Upvotes', value: '1')],
    );
    final second = topPostFixture(
      title: 'Hacker News item',
      providerKey: 'hacker-news',
      providerMetrics: const [ProviderMetric(label: 'Points', value: '500')],
    );

    expect(_titles(orderMoreSelectedPostsByUsefulness([first, second])), [
      'Reddit item',
      'Hacker News item',
    ]);
  });
}

List<String> _titles(Iterable<TopRead> items) =>
    items.map((item) => item.title).toList(growable: false);
