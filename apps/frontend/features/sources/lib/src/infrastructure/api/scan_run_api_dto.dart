import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class RequestScanApiRequestDto {
  const RequestScanApiRequestDto({
    required this.scope,
    required this.sourceBindingId,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final String sourceBindingId;
  final String idempotencyKey;
}

final class RequestScanApiResponseDto {
  const RequestScanApiResponseDto({
    required this.scanJobId,
    required this.status,
    required this.created,
  });

  final String scanJobId;
  final String status;
  final bool created;
}

final class ScanStatusApiRequestDto {
  const ScanStatusApiRequestDto({required this.scope, required this.scanJobId});

  final WorkspaceScope scope;
  final String scanJobId;
}

final class ScanStatusApiDto {
  const ScanStatusApiDto({
    required this.scanJobId,
    required this.sourceBindingId,
    required this.scanPolicyId,
    required this.status,
    required this.userState,
    required this.operatorAction,
    required this.requestedAt,
    this.enqueuedAt,
    this.completedAt,
    this.failureClass,
    this.failureReason,
    this.latestAttempt,
  });

  final String scanJobId;
  final String sourceBindingId;
  final String scanPolicyId;
  final String status;
  final String userState;
  final String? failureClass;
  final String operatorAction;
  final DateTime requestedAt;
  final DateTime? enqueuedAt;
  final DateTime? completedAt;
  final String? failureReason;
  final ScanExecutionAttemptApiDto? latestAttempt;
}

final class ScanExecutionAttemptApiDto {
  const ScanExecutionAttemptApiDto({
    required this.sourceBindingId,
    required this.status,
    required this.startedAt,
    required this.fetched,
    required this.inserted,
    required this.skippedDuplicates,
    required this.projected,
    this.finishedAt,
    this.failureReason,
  });

  final String sourceBindingId;
  final String status;
  final DateTime startedAt;
  final DateTime? finishedAt;
  final num fetched;
  final num inserted;
  final num skippedDuplicates;
  final num projected;
  final String? failureReason;
}
