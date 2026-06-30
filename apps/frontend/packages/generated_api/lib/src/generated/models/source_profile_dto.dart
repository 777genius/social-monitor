// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_profile_dto_readiness_state_readiness_state.dart';
import 'source_profile_dto_runtime_readiness_runtime_readiness.dart';
import 'source_profile_freshness_guard_dto.dart';
import 'source_profile_health_dto.dart';
import 'source_profile_live_evidence_requirement_dto.dart';

part 'source_profile_dto.g.dart';

@JsonSerializable()
class SourceProfileDto {
  const SourceProfileDto({
    required this.acquisitionMode,
    required this.cursorModel,
    required this.health,
    required this.limitations,
    required this.liveBetaBlockers,
    required this.liveEvidenceRequirements,
    required this.productionSafe,
    required this.providerKey,
    required this.quotaModel,
    required this.readinessState,
    required this.runtimeReadiness,
    required this.supportedContentUnits,
    required this.supportedQueryModes,
    required this.unsupportedContentUnits,
    this.capabilityVersion,
    this.displayName,
    this.freshnessGuard,
  });

  factory SourceProfileDto.fromJson(Map<String, Object?> json) =>
      _$SourceProfileDtoFromJson(json);

  final String acquisitionMode;
  final num? capabilityVersion;
  final String cursorModel;
  final String? displayName;
  final SourceProfileFreshnessGuardDto? freshnessGuard;
  final SourceProfileHealthDto health;
  final List<String> limitations;
  final List<String> liveBetaBlockers;
  final List<SourceProfileLiveEvidenceRequirementDto> liveEvidenceRequirements;
  final bool productionSafe;
  final String providerKey;
  final String quotaModel;
  final SourceProfileDtoReadinessStateReadinessState readinessState;
  final SourceProfileDtoRuntimeReadinessRuntimeReadiness runtimeReadiness;
  final List<String> supportedContentUnits;
  final List<String> supportedQueryModes;
  final List<String> unsupportedContentUnits;

  Map<String, Object?> toJson() => _$SourceProfileDtoToJson(this);
}
