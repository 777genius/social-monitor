import 'source_binding_api_dto.dart';

final class SourceBindingHealthApiDto {
  const SourceBindingHealthApiDto({
    required this.sourceBinding,
    required this.healthState,
    required this.operatorAction,
    required this.healthExplanation,
    required this.evaluatedAt,
    this.freshness,
    this.latestScan,
  });

  final SourceBindingApiDto sourceBinding;
  final String healthState;
  final String operatorAction;
  final SourceBindingHealthExplanationApiDto healthExplanation;
  final DateTime evaluatedAt;
  final SourceBindingFreshnessApiDto? freshness;
  final SourceBindingScanSummaryApiDto? latestScan;
}

final class SourceBindingHealthExplanationApiDto {
  const SourceBindingHealthExplanationApiDto({
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

final class SourceBindingFreshnessApiDto {
  const SourceBindingFreshnessApiDto({
    required this.isFresh,
    this.ageSeconds,
    this.staleBySeconds,
  });

  final bool isFresh;
  final num? ageSeconds;
  final num? staleBySeconds;
}

final class SourceBindingScanSummaryApiDto {
  const SourceBindingScanSummaryApiDto({
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
