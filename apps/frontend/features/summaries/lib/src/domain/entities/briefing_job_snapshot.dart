enum BriefingJobStatus {
  requested,
  running,
  completed,
  noSignal,
  failed,
  unknown;

  bool get isPending => this == requested || this == running;

  bool get isTerminal =>
      this == completed || this == noSignal || this == failed;

  bool get shouldRefreshBriefing => this == completed || this == noSignal;
}

final class BriefingJobSnapshot {
  const BriefingJobSnapshot({
    required this.id,
    required this.status,
    this.created = false,
    this.briefingId,
    this.failureReason,
    this.requestedAt,
    this.startedAt,
    this.completedAt,
    this.failedAt,
  });

  final String id;
  final BriefingJobStatus status;
  final bool created;
  final String? briefingId;
  final String? failureReason;
  final DateTime? requestedAt;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final DateTime? failedAt;
}
