import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../entities/weekly_summary_artifact.dart';
import '../value_objects/weekly_summary_evidence_limitation.dart';
import '../value_objects/weekly_summary_week.dart';

enum WeeklySummaryProjectionStatus { complete, partial, unavailable }

enum WeeklySummaryBlockingReason {
  certifiedDailyEvidenceIncomplete,
  activeWeeklyCertifiedArtifactMissing;

  String get code => switch (this) {
    WeeklySummaryBlockingReason.certifiedDailyEvidenceIncomplete =>
      'certified_daily_evidence_incomplete',
    WeeklySummaryBlockingReason.activeWeeklyCertifiedArtifactMissing =>
      'active_weekly_certified_artifact_missing',
  };
}

sealed class WeeklySummaryProjection {
  const WeeklySummaryProjection._({
    required this.scope,
    required this.week,
    required this.certifiedDailyEvidenceDates,
    required this.missingDailyEvidenceDates,
    required this.blockingReasons,
    required this.activeWeeklyCertifiedArtifactPresent,
    required this.evidenceLimitations,
  });

  final WorkspaceScope scope;
  final WeeklySummaryWeek week;
  final List<String> certifiedDailyEvidenceDates;
  final List<String> missingDailyEvidenceDates;
  final List<WeeklySummaryBlockingReason> blockingReasons;
  final bool activeWeeklyCertifiedArtifactPresent;
  final List<WeeklySummaryEvidenceLimitation> evidenceLimitations;

  WeeklySummaryProjectionStatus get status;

  static Result<WeeklySummaryProjection> create({
    required WeeklySummaryProjectionStatus status,
    required WorkspaceScope scope,
    required WeeklySummaryWeek week,
    required List<String> certifiedDailyEvidenceDates,
    required List<String> missingDailyEvidenceDates,
    required List<WeeklySummaryBlockingReason> blockingReasons,
    required bool activeWeeklyCertifiedArtifactPresent,
    required List<WeeklySummaryEvidenceLimitation> evidenceLimitations,
    required WeeklySummaryArtifact? artifact,
  }) {
    if (!scope.isValid ||
        !_isExactEvidenceWindow(
          week: week,
          certified: certifiedDailyEvidenceDates,
          missing: missingDailyEvidenceDates,
        )) {
      return _invalid();
    }
    if (!_areEvidenceLimitationsExact(
      limitations: evidenceLimitations,
      certifiedDates: certifiedDailyEvidenceDates,
    )) {
      return _invalid();
    }

    final expectedReasons = <WeeklySummaryBlockingReason>[
      if (certifiedDailyEvidenceDates.length != week.utcDates.length)
        WeeklySummaryBlockingReason.certifiedDailyEvidenceIncomplete,
      if (!activeWeeklyCertifiedArtifactPresent)
        WeeklySummaryBlockingReason.activeWeeklyCertifiedArtifactMissing,
    ];
    if (!_sameReasons(blockingReasons, expectedReasons)) {
      return _invalid();
    }

    final expectedStatus = certifiedDailyEvidenceDates.isEmpty &&
            !activeWeeklyCertifiedArtifactPresent
        ? WeeklySummaryProjectionStatus.unavailable
        : expectedReasons.isEmpty
        ? WeeklySummaryProjectionStatus.complete
        : WeeklySummaryProjectionStatus.partial;
    if (status != expectedStatus) {
      return _invalid();
    }
    if ((status == WeeklySummaryProjectionStatus.complete) !=
            (artifact != null) ||
        (artifact != null && !activeWeeklyCertifiedArtifactPresent)) {
      return _invalid();
    }

    final certified = List<String>.unmodifiable(certifiedDailyEvidenceDates);
    final missing = List<String>.unmodifiable(missingDailyEvidenceDates);
    final reasons = List<WeeklySummaryBlockingReason>.unmodifiable(
      blockingReasons,
    );
    final limitations = List<WeeklySummaryEvidenceLimitation>.unmodifiable(
      evidenceLimitations,
    );
    return Result.success(
      switch (status) {
        WeeklySummaryProjectionStatus.complete =>
          CompleteWeeklySummaryProjection._(
            scope: scope,
            week: week,
            certifiedDailyEvidenceDates: certified,
            missingDailyEvidenceDates: missing,
            blockingReasons: reasons,
            activeWeeklyCertifiedArtifactPresent:
                activeWeeklyCertifiedArtifactPresent,
            evidenceLimitations: limitations,
            artifact: artifact!,
          ),
        WeeklySummaryProjectionStatus.partial =>
          PartialWeeklySummaryProjection._(
            scope: scope,
            week: week,
            certifiedDailyEvidenceDates: certified,
            missingDailyEvidenceDates: missing,
            blockingReasons: reasons,
            activeWeeklyCertifiedArtifactPresent:
                activeWeeklyCertifiedArtifactPresent,
            evidenceLimitations: limitations,
          ),
        WeeklySummaryProjectionStatus.unavailable =>
          UnavailableWeeklySummaryProjection._(
            scope: scope,
            week: week,
            certifiedDailyEvidenceDates: certified,
            missingDailyEvidenceDates: missing,
            blockingReasons: reasons,
            activeWeeklyCertifiedArtifactPresent:
                activeWeeklyCertifiedArtifactPresent,
            evidenceLimitations: limitations,
          ),
      },
    );
  }

  static bool _isExactEvidenceWindow({
    required WeeklySummaryWeek week,
    required List<String> certified,
    required List<String> missing,
  }) {
    final expectedDates = week.utcDates;
    final expected = expectedDates.toSet();
    final combined = <String>[...certified, ...missing];
    return _isStrictlyAscending(certified) &&
        _isStrictlyAscending(missing) &&
        combined.length == expectedDates.length &&
        combined.toSet().length == expected.length &&
        combined.toSet().containsAll(expected);
  }

  static bool _isStrictlyAscending(List<String> values) {
    for (var index = 1; index < values.length; index += 1) {
      if (values[index - 1].compareTo(values[index]) >= 0) {
        return false;
      }
    }
    return true;
  }

  static bool _areEvidenceLimitationsExact({
    required List<WeeklySummaryEvidenceLimitation> limitations,
    required List<String> certifiedDates,
  }) {
    final certified = certifiedDates.toSet();
    String? previousKey;
    for (final limitation in limitations) {
      final key = [
        limitation.requestedUtcDate,
        limitation.providerKey,
        limitation.evidenceState,
      ].join(':');
      if (!certified.contains(limitation.requestedUtcDate) ||
          (previousKey != null && previousKey.compareTo(key) >= 0)) {
        return false;
      }
      previousKey = key;
    }
    return true;
  }

  static bool _sameReasons(
    List<WeeklySummaryBlockingReason> actual,
    List<WeeklySummaryBlockingReason> expected,
  ) {
    if (actual.length != expected.length) {
      return false;
    }
    for (var index = 0; index < actual.length; index += 1) {
      if (actual[index] != expected[index]) {
        return false;
      }
    }
    return true;
  }

  static Result<WeeklySummaryProjection> _invalid() => const Result.failure(
    ValidationFailure(
      message: 'Weekly summary certification state could not be verified.',
      code: 'summaries.weekly_projection_invalid',
    ),
  );
}

final class CompleteWeeklySummaryProjection extends WeeklySummaryProjection {
  const CompleteWeeklySummaryProjection._({
    required super.scope,
    required super.week,
    required super.certifiedDailyEvidenceDates,
    required super.missingDailyEvidenceDates,
    required super.blockingReasons,
    required super.activeWeeklyCertifiedArtifactPresent,
    required super.evidenceLimitations,
    required this.artifact,
  }) : super._();

  final WeeklySummaryArtifact artifact;

  @override
  WeeklySummaryProjectionStatus get status =>
      WeeklySummaryProjectionStatus.complete;
}

sealed class BlockedWeeklySummaryProjection extends WeeklySummaryProjection {
  const BlockedWeeklySummaryProjection._({
    required super.scope,
    required super.week,
    required super.certifiedDailyEvidenceDates,
    required super.missingDailyEvidenceDates,
    required super.blockingReasons,
    required super.activeWeeklyCertifiedArtifactPresent,
    required super.evidenceLimitations,
  }) : super._();
}

final class PartialWeeklySummaryProjection
    extends BlockedWeeklySummaryProjection {
  const PartialWeeklySummaryProjection._({
    required super.scope,
    required super.week,
    required super.certifiedDailyEvidenceDates,
    required super.missingDailyEvidenceDates,
    required super.blockingReasons,
    required super.activeWeeklyCertifiedArtifactPresent,
    required super.evidenceLimitations,
  }) : super._();

  @override
  WeeklySummaryProjectionStatus get status =>
      WeeklySummaryProjectionStatus.partial;
}

final class UnavailableWeeklySummaryProjection
    extends BlockedWeeklySummaryProjection {
  const UnavailableWeeklySummaryProjection._({
    required super.scope,
    required super.week,
    required super.certifiedDailyEvidenceDates,
    required super.missingDailyEvidenceDates,
    required super.blockingReasons,
    required super.activeWeeklyCertifiedArtifactPresent,
    required super.evidenceLimitations,
  }) : super._();

  @override
  WeeklySummaryProjectionStatus get status =>
      WeeklySummaryProjectionStatus.unavailable;
}
