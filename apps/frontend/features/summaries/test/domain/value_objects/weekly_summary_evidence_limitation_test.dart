import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/weekly_summary_evidence_limitation.dart';

void main() {
  test('creates the explicit historical unavailable GitHub limitation', () {
    final result = WeeklySummaryEvidenceLimitation.create(
      requestedUtcDate: '2026-07-20',
      providerKey: WeeklySummaryEvidenceLimitation.githubTrendingProvider,
      evidenceState: WeeklySummaryEvidenceLimitation.historicalUnavailableState,
    );

    expect(result, isA<ResultSuccess<WeeklySummaryEvidenceLimitation>>());
    final limitation =
        (result as ResultSuccess<WeeklySummaryEvidenceLimitation>).value;
    expect(limitation, isA<HistoricalUnavailableWeeklySummaryEvidence>());
    expect(limitation.requestedUtcDate, '2026-07-20');
    expect(limitation.providerKey, 'github-trending-page');
    expect(limitation.evidenceState, 'historical_unavailable');
  });

  for (final invalid in <({String date, String provider, String state})>[
    (
      date: '2026-02-30',
      provider: 'github-trending-page',
      state: 'historical_unavailable',
    ),
    (
      date: '2026-07-20',
      provider: 'unknown-provider',
      state: 'historical_unavailable',
    ),
    (
      date: '2026-07-20',
      provider: 'github-trending-page',
      state: 'verified',
    ),
  ]) {
    test('rejects unsupported limitation ${invalid.provider}/${invalid.state}', () {
      final result = WeeklySummaryEvidenceLimitation.create(
        requestedUtcDate: invalid.date,
        providerKey: invalid.provider,
        evidenceState: invalid.state,
      );

      expect(result, isA<ResultFailure<WeeklySummaryEvidenceLimitation>>());
    });
  }
}
