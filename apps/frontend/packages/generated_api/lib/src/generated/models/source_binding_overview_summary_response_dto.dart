// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_overview_provider_breakdown_response_dto.dart';

part 'source_binding_overview_summary_response_dto.g.dart';

@JsonSerializable()
class SourceBindingOverviewSummaryResponseDto {
  const SourceBindingOverviewSummaryResponseDto({
    required this.attentionRequiredBindings,
    required this.canScanNowBindings,
    required this.degradedBindings,
    required this.downBindings,
    required this.freshSuccessSkips,
    required this.healthyBindings,
    required this.notConfiguredBindings,
    required this.operatorAction,
    required this.pausedBindings,
    required this.providerBreakdown,
    required this.providerFailureBackoffSkips,
    required this.providerUnavailableScans,
    required this.rateLimitedBindings,
    required this.scanningBindings,
    required this.scheduledBindings,
    required this.signals,
    required this.staleBindings,
    required this.totalBindings,
    this.nextEligibleAt,
  });

  factory SourceBindingOverviewSummaryResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceBindingOverviewSummaryResponseDtoFromJson(json);

  final num attentionRequiredBindings;
  final num canScanNowBindings;
  final num degradedBindings;
  final num downBindings;
  final num freshSuccessSkips;
  final num healthyBindings;
  final DateTime? nextEligibleAt;
  final num notConfiguredBindings;
  final String operatorAction;
  final num pausedBindings;
  final List<SourceBindingOverviewProviderBreakdownResponseDto>
  providerBreakdown;
  final num providerFailureBackoffSkips;
  final num providerUnavailableScans;
  final num rateLimitedBindings;
  final num scanningBindings;
  final num scheduledBindings;
  final List<String> signals;
  final num staleBindings;
  final num totalBindings;

  Map<String, Object?> toJson() =>
      _$SourceBindingOverviewSummaryResponseDtoToJson(this);
}
