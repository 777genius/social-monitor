import '../value_objects/summary_period.dart';

enum ReaderSummaryJobStatus {
  requested,
  running,
  completed,
  noSignal,
  failed,
  qualityRejected,
  unknown;

  bool get isPending => this == requested || this == running;

  bool get isTerminal =>
      this == completed ||
      this == noSignal ||
      this == failed ||
      this == qualityRejected;

  bool get shouldRefreshSummary => this == completed || this == noSignal;
}

final class ReaderSummaryJobSnapshot {
  const ReaderSummaryJobSnapshot({
    required this.id,
    required this.status,
    this.created = false,
    this.summaryId,
    this.failureReason,
    this.requestedAt,
    this.startedAt,
    this.completedAt,
    this.failedAt,
    this.period,
  });

  final String id;
  final ReaderSummaryJobStatus status;
  final bool created;
  final String? summaryId;
  final String? failureReason;
  final DateTime? requestedAt;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final DateTime? failedAt;
  final SummaryPeriod? period;
}
