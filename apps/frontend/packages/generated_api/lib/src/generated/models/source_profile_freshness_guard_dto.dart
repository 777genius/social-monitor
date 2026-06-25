// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_profile_freshness_guard_dto_provider_failure_health_state_provider_failure_health_state.dart';
import 'source_profile_freshness_guard_dto_stale_read_model_state_stale_read_model_state.dart';

part 'source_profile_freshness_guard_dto.g.dart';

@JsonSerializable()
class SourceProfileFreshnessGuardDto {
  const SourceProfileFreshnessGuardDto({
    required this.cursorResumeRequired,
    required this.maxStalenessSeconds,
    required this.providerFailureHealthState,
    required this.rateLimitBackoffRequired,
    required this.scanHistoryRequired,
    required this.signals,
    required this.skipRecentlyScanned,
    required this.staleReadModelState,
  });

  factory SourceProfileFreshnessGuardDto.fromJson(Map<String, Object?> json) =>
      _$SourceProfileFreshnessGuardDtoFromJson(json);

  final bool cursorResumeRequired;
  final num maxStalenessSeconds;
  final SourceProfileFreshnessGuardDtoProviderFailureHealthStateProviderFailureHealthState
  providerFailureHealthState;
  final bool rateLimitBackoffRequired;
  final bool scanHistoryRequired;
  final List<String> signals;
  final bool skipRecentlyScanned;
  final SourceProfileFreshnessGuardDtoStaleReadModelStateStaleReadModelState
  staleReadModelState;

  Map<String, Object?> toJson() => _$SourceProfileFreshnessGuardDtoToJson(this);
}
