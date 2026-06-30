// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_overview_degradation_reason_response_dto.dart';

part 'source_binding_overview_provider_breakdown_response_dto.g.dart';

@JsonSerializable()
class SourceBindingOverviewProviderBreakdownResponseDto {
  const SourceBindingOverviewProviderBreakdownResponseDto({
    required this.authFailedBindings,
    required this.canScanNowBindings,
    required this.degradationReasons,
    required this.degradedBindings,
    required this.downBindings,
    required this.freshSuccessSkips,
    required this.healthyBindings,
    required this.notConfiguredBindings,
    required this.pausedBindings,
    required this.providerFailureBackoffSkips,
    required this.providerKey,
    required this.providerUnavailableScans,
    required this.rateLimitBackoffSkips,
    required this.rateLimitedBindings,
    required this.scanningBindings,
    required this.scheduledBindings,
    required this.signals,
    required this.staleBindings,
    required this.totalBindings,
    required this.unsupportedScopeBindings,
    this.nextEligibleAt,
  });

  factory SourceBindingOverviewProviderBreakdownResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceBindingOverviewProviderBreakdownResponseDtoFromJson(json);

  final num authFailedBindings;
  final num canScanNowBindings;
  final List<SourceBindingOverviewDegradationReasonResponseDto>
  degradationReasons;
  final num degradedBindings;
  final num downBindings;
  final num freshSuccessSkips;
  final num healthyBindings;
  final DateTime? nextEligibleAt;
  final num notConfiguredBindings;
  final num pausedBindings;
  final num providerFailureBackoffSkips;
  final String providerKey;
  final num providerUnavailableScans;
  final num rateLimitBackoffSkips;
  final num rateLimitedBindings;
  final num scanningBindings;
  final num scheduledBindings;
  final List<String> signals;
  final num staleBindings;
  final num totalBindings;
  final num unsupportedScopeBindings;

  Map<String, Object?> toJson() =>
      _$SourceBindingOverviewProviderBreakdownResponseDtoToJson(this);
}
