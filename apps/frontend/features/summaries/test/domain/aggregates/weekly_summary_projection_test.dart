import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/weekly_summary_projection.dart';

import '../../support/weekly_summary_projection_test_data.dart';

void main() {
  test('preserves limitations on a complete sealed projection', () {
    final limitation = weeklySummaryHistoricalLimitation();
    final projection = completeWeeklySummaryProjection(
      evidenceLimitations: [limitation],
    );

    expect(projection.activeWeeklyCertifiedArtifactPresent, isTrue);
    expect(projection.evidenceLimitations, [same(limitation)]);
  });

  test('models active artifact truth without exposing it while partial', () {
    final projection = partialWeeklySummaryProjection(
      activeWeeklyCertifiedArtifactPresent: true,
      evidenceLimitations: [weeklySummaryHistoricalLimitation()],
    );

    expect(projection, isA<BlockedWeeklySummaryProjection>());
    expect(projection.activeWeeklyCertifiedArtifactPresent, isTrue);
    expect(projection.blockingReasons, [
      WeeklySummaryBlockingReason.certifiedDailyEvidenceIncomplete,
    ]);
  });

  test('rejects a limitation outside certified evidence dates', () {
    final limitation = weeklySummaryHistoricalLimitation(
      requestedUtcDate: weeklySummaryTestWeek.utcDates.last,
    );
    final result = WeeklySummaryProjection.create(
      status: WeeklySummaryProjectionStatus.partial,
      scope: weeklySummaryWorkspaceScope,
      week: weeklySummaryTestWeek,
      certifiedDailyEvidenceDates: weeklySummaryTestWeek.utcDates
          .take(6)
          .toList(growable: false),
      missingDailyEvidenceDates: [weeklySummaryTestWeek.utcDates.last],
      blockingReasons: const [
        WeeklySummaryBlockingReason.certifiedDailyEvidenceIncomplete,
      ],
      activeWeeklyCertifiedArtifactPresent: true,
      evidenceLimitations: [limitation],
      artifact: null,
    );

    expect(result, isA<ResultFailure<WeeklySummaryProjection>>());
  });

  test('rejects artifact payloads for partial and unavailable projections', () {
    for (final status in [
      WeeklySummaryProjectionStatus.partial,
      WeeklySummaryProjectionStatus.unavailable,
    ]) {
      final result = WeeklySummaryProjection.create(
        status: status,
        scope: weeklySummaryWorkspaceScope,
        week: weeklySummaryTestWeek,
        certifiedDailyEvidenceDates: const [],
        missingDailyEvidenceDates: weeklySummaryTestWeek.utcDates,
        blockingReasons: const [
          WeeklySummaryBlockingReason.certifiedDailyEvidenceIncomplete,
          WeeklySummaryBlockingReason.activeWeeklyCertifiedArtifactMissing,
        ],
        activeWeeklyCertifiedArtifactPresent: false,
        evidenceLimitations: const [],
        artifact: weeklySummaryTestArtifact(),
      );

      expect(result, isA<ResultFailure<WeeklySummaryProjection>>());
    }
  });
}
