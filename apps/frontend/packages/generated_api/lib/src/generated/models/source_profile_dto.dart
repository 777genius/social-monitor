// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_profile_dto_readiness_state_readiness_state.dart';
import 'source_profile_dto_runtime_readiness_runtime_readiness.dart';

part 'source_profile_dto.g.dart';

@JsonSerializable()
class SourceProfileDto {
  const SourceProfileDto({
    required this.acquisitionMode,
    required this.cursorModel,
    required this.limitations,
    required this.liveBetaBlockers,
    required this.productionSafe,
    required this.providerKey,
    required this.quotaModel,
    required this.readinessState,
    required this.runtimeReadiness,
    required this.supportedContentUnits,
    required this.supportedQueryModes,
    this.capabilityVersion,
    this.displayName,
  });

  factory SourceProfileDto.fromJson(Map<String, Object?> json) =>
      _$SourceProfileDtoFromJson(json);

  final String acquisitionMode;
  final num? capabilityVersion;
  final String cursorModel;
  final String? displayName;
  final List<String> limitations;
  final List<String> liveBetaBlockers;
  final bool productionSafe;
  final String providerKey;
  final String quotaModel;
  final SourceProfileDtoReadinessStateReadinessState readinessState;
  final SourceProfileDtoRuntimeReadinessRuntimeReadiness runtimeReadiness;
  final List<String> supportedContentUnits;
  final List<String> supportedQueryModes;

  Map<String, Object?> toJson() => _$SourceProfileDtoToJson(this);
}
