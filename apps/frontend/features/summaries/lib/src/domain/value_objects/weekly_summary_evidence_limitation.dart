import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

sealed class WeeklySummaryEvidenceLimitation {
  const WeeklySummaryEvidenceLimitation._({
    required this.requestedUtcDate,
  });

  static const historicalUnavailableState = 'historical_unavailable';
  static const githubTrendingProvider = 'github-trending-page';

  final String requestedUtcDate;

  String get providerKey;
  String get evidenceState;

  static Result<WeeklySummaryEvidenceLimitation> create({
    required String requestedUtcDate,
    required String providerKey,
    required String evidenceState,
  }) {
    if (!_isUtcDate(requestedUtcDate) ||
        providerKey != githubTrendingProvider ||
        evidenceState != historicalUnavailableState) {
      return const Result.failure(
        ValidationFailure(
          message: 'Weekly summary evidence limitation is invalid.',
          code: 'summaries.weekly_evidence_limitation_invalid',
        ),
      );
    }
    return Result.success(
      HistoricalUnavailableWeeklySummaryEvidence._(
        requestedUtcDate: requestedUtcDate,
      ),
    );
  }

  static bool _isUtcDate(String value) {
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(value)) {
      return false;
    }
    final parsed = DateTime.tryParse('${value}T00:00:00.000Z');
    return parsed != null && parsed.toIso8601String().startsWith(value);
  }
}

final class HistoricalUnavailableWeeklySummaryEvidence
    extends WeeklySummaryEvidenceLimitation {
  const HistoricalUnavailableWeeklySummaryEvidence._({
    required super.requestedUtcDate,
  }) : super._();

  @override
  String get providerKey =>
      WeeklySummaryEvidenceLimitation.githubTrendingProvider;

  @override
  String get evidenceState =>
      WeeklySummaryEvidenceLimitation.historicalUnavailableState;
}
