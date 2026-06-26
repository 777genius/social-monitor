// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_personalization_dto_memory_guidance_status_memory_guidance_status.dart';

part 'briefing_personalization_dto.g.dart';

@JsonSerializable()
class BriefingPersonalizationDto {
  const BriefingPersonalizationDto({
    required this.blockedProviderCount,
    required this.keywordPreferenceCount,
    required this.memoryGuidanceApplied,
    required this.memoryGuidanceStatus,
    required this.mutedKeywordCount,
    required this.providerPreferenceCount,
    required this.signals,
  });

  factory BriefingPersonalizationDto.fromJson(Map<String, Object?> json) =>
      _$BriefingPersonalizationDtoFromJson(json);

  final num blockedProviderCount;
  final num keywordPreferenceCount;
  final bool memoryGuidanceApplied;
  final BriefingPersonalizationDtoMemoryGuidanceStatusMemoryGuidanceStatus
  memoryGuidanceStatus;
  final num mutedKeywordCount;
  final num providerPreferenceCount;
  final List<String> signals;

  Map<String, Object?> toJson() => _$BriefingPersonalizationDtoToJson(this);
}
