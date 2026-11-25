import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/scan_policy.dart';

enum ScanPolicyPreset {
  fifteenMinutes('15m', 900),
  hourly('1h', 3600),
  sixHours('6h', 21600),
  daily('Daily', 86400);

  const ScanPolicyPreset(this.label, this.seconds);

  final String label;
  final int seconds;
}

final class ScanPolicyFormDraft {
  String intervalSeconds = '3600';
  String freshnessSeconds = '3600';
  String retryBudget = '3';

  void updateFromPolicy(ScanPolicy policy) {
    intervalSeconds = '${policy.intervalSeconds}';
    freshnessSeconds = '${policy.freshnessSeconds}';
    retryBudget = '${policy.retryBudget}';
  }

  void applyPreset(ScanPolicyPreset preset) {
    intervalSeconds = '${preset.seconds}';
    freshnessSeconds = '${preset.seconds}';
  }

  ValidationFailure? validate() {
    final interval = _parsePositiveInt(intervalSeconds);
    if (interval == null || interval < 60) {
      return const ValidationFailure(
        message: 'Interval must be at least 60 seconds',
        field: 'intervalSeconds',
        code: 'scan_policy.interval_too_small',
      );
    }

    final freshness = _parsePositiveInt(freshnessSeconds);
    if (freshness == null || freshness < 60) {
      return const ValidationFailure(
        message: 'Freshness must be at least 60 seconds',
        field: 'freshnessSeconds',
        code: 'scan_policy.freshness_too_small',
      );
    }
    if (freshness < interval) {
      return const ValidationFailure(
        message: 'Freshness must be greater than or equal to interval',
        field: 'freshnessSeconds',
        code: 'scan_policy.freshness_less_than_interval',
      );
    }

    final retries = _parsePositiveInt(retryBudget);
    if (retries == null || retries < 0 || retries > 10) {
      return const ValidationFailure(
        message: 'Retry budget must be between 0 and 10',
        field: 'retryBudget',
        code: 'scan_policy.retry_budget_out_of_range',
      );
    }

    return null;
  }

  int get intervalSecondsValue => int.parse(intervalSeconds.trim());

  int get freshnessSecondsValue => int.parse(freshnessSeconds.trim());

  int get retryBudgetValue => int.parse(retryBudget.trim());

  int? _parsePositiveInt(String value) {
    final parsed = int.tryParse(value.trim());
    if (parsed == null) {
      return null;
    }
    return parsed;
  }
}
