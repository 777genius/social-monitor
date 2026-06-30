import '../value_objects/source_binding_health_state.dart';
import 'source_binding.dart';

final class SourceBindingHealthSnapshot {
  const SourceBindingHealthSnapshot({
    required this.binding,
    required this.healthState,
    required this.operatorAction,
    required this.healthExplanation,
    required this.evaluatedAt,
    this.freshness,
    this.latestScan,
  });

  final SourceBinding binding;
  final SourceBindingHealthState healthState;
  final String operatorAction;
  final SourceBindingHealthExplanation healthExplanation;
  final DateTime evaluatedAt;
  final SourceBindingFreshness? freshness;
  final SourceBindingScanSummary? latestScan;
}

final class SourceBindingHealthExplanation {
  const SourceBindingHealthExplanation({
    required this.reasonCode,
    required this.message,
    required this.operatorAction,
    required this.signals,
    this.unavailableUntil,
    this.staleBySeconds,
  });

  final String reasonCode;
  final String message;
  final String operatorAction;
  final List<String> signals;
  final DateTime? unavailableUntil;
  final num? staleBySeconds;
}

final class SourceBindingFreshness {
  const SourceBindingFreshness({
    required this.isFresh,
    this.ageSeconds,
    this.staleBySeconds,
  });

  final bool isFresh;
  final num? ageSeconds;
  final num? staleBySeconds;
}

final class SourceBindingScanSummary {
  const SourceBindingScanSummary({
    required this.scanJobId,
    required this.status,
    required this.userState,
    required this.operatorAction,
    this.failureClass,
    this.failureReason,
    this.fetched,
    this.inserted,
    this.skippedDuplicates,
    this.projected,
  });

  final String scanJobId;
  final String status;
  final String userState;
  final String operatorAction;
  final String? failureClass;
  final String? failureReason;
  final num? fetched;
  final num? inserted;
  final num? skippedDuplicates;
  final num? projected;
}
