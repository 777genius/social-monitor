// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'source_binding_overview_provider_breakdown_response_dto.g.dart';

@JsonSerializable()
class SourceBindingOverviewProviderBreakdownResponseDto {
  const SourceBindingOverviewProviderBreakdownResponseDto({
    required this.canScanNowBindings,
    required this.degradedBindings,
    required this.freshSuccessSkips,
    required this.healthyBindings,
    required this.notConfiguredBindings,
    required this.pausedBindings,
    required this.providerFailureBackoffSkips,
    required this.providerKey,
    required this.providerUnavailableScans,
    required this.rateLimitBackoffSkips,
    required this.scanningBindings,
    required this.scheduledBindings,
    required this.signals,
    required this.staleBindings,
    required this.totalBindings,
    this.nextEligibleAt,
  });

  factory SourceBindingOverviewProviderBreakdownResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceBindingOverviewProviderBreakdownResponseDtoFromJson(json);

  final num canScanNowBindings;
  final num degradedBindings;
  final num freshSuccessSkips;
  final num healthyBindings;
  final DateTime? nextEligibleAt;
  final num notConfiguredBindings;
  final num pausedBindings;
  final num providerFailureBackoffSkips;
  final String providerKey;
  final num providerUnavailableScans;
  final num rateLimitBackoffSkips;
  final num scanningBindings;
  final num scheduledBindings;
  final List<String> signals;
  final num staleBindings;
  final num totalBindings;

  Map<String, Object?> toJson() =>
      _$SourceBindingOverviewProviderBreakdownResponseDtoToJson(this);
}
