import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class ScanPolicyApiRequestDto {
  const ScanPolicyApiRequestDto({
    required this.scope,
    required this.sourceBindingId,
  });

  final WorkspaceScope scope;
  final String sourceBindingId;
}

final class ScanPolicyApiDto {
  const ScanPolicyApiDto({
    required this.id,
    required this.sourceBindingId,
    required this.intervalSeconds,
    required this.freshnessSeconds,
    required this.retryBudget,
    required this.nextRunAt,
    required this.createdAt,
  });

  final String id;
  final String sourceBindingId;
  final num intervalSeconds;
  final num freshnessSeconds;
  final num retryBudget;
  final DateTime nextRunAt;
  final DateTime createdAt;
}

final class SetScanPolicyApiRequestDto {
  const SetScanPolicyApiRequestDto({
    required this.scope,
    required this.sourceBindingId,
    required this.intervalSeconds,
    required this.freshnessSeconds,
    required this.retryBudget,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final String sourceBindingId;
  final int intervalSeconds;
  final int freshnessSeconds;
  final int retryBudget;
  final String idempotencyKey;
}
