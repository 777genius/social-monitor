// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_profile_live_evidence_requirement_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceProfileLiveEvidenceRequirementDto
_$SourceProfileLiveEvidenceRequirementDtoFromJson(
  Map<String, dynamic> json,
) => SourceProfileLiveEvidenceRequirementDto(
  description: json['description'] as String,
  requiredFor:
      SourceProfileLiveEvidenceRequirementDtoRequiredForRequiredFor.fromJson(
        json['requiredFor'] as String,
      ),
  signalId: json['signalId'] as String,
  verificationCommand: json['verificationCommand'] as String,
  artifactEnv: json['artifactEnv'] as String?,
);

Map<String, dynamic> _$SourceProfileLiveEvidenceRequirementDtoToJson(
  SourceProfileLiveEvidenceRequirementDto instance,
) => <String, dynamic>{
  'artifactEnv': instance.artifactEnv,
  'description': instance.description,
  'requiredFor': instance.requiredFor,
  'signalId': instance.signalId,
  'verificationCommand': instance.verificationCommand,
};
