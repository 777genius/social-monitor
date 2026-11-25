// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_profile_live_evidence_requirement_dto_required_for_required_for.dart';

part 'source_profile_live_evidence_requirement_dto.g.dart';

@JsonSerializable()
class SourceProfileLiveEvidenceRequirementDto {
  const SourceProfileLiveEvidenceRequirementDto({
    required this.description,
    required this.requiredFor,
    required this.signalId,
    required this.verificationCommand,
    this.artifactEnv,
  });

  factory SourceProfileLiveEvidenceRequirementDto.fromJson(
    Map<String, Object?> json,
  ) => _$SourceProfileLiveEvidenceRequirementDtoFromJson(json);

  final String? artifactEnv;
  final String description;
  final SourceProfileLiveEvidenceRequirementDtoRequiredForRequiredFor
  requiredFor;
  final String signalId;
  final String verificationCommand;

  Map<String, Object?> toJson() =>
      _$SourceProfileLiveEvidenceRequirementDtoToJson(this);
}
