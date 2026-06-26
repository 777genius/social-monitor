// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'relevance_memory_guidance_dto_status_status.dart';

part 'relevance_memory_guidance_dto.g.dart';

@JsonSerializable()
class RelevanceMemoryGuidanceDto {
  const RelevanceMemoryGuidanceDto({
    required this.applied,
    required this.blockedProviderCount,
    required this.keywordPreferenceCount,
    required this.mutedKeywordCount,
    required this.providerPreferenceCount,
    required this.signals,
    required this.status,
  });

  factory RelevanceMemoryGuidanceDto.fromJson(Map<String, Object?> json) =>
      _$RelevanceMemoryGuidanceDtoFromJson(json);

  final bool applied;
  final num blockedProviderCount;
  final num keywordPreferenceCount;
  final num mutedKeywordCount;
  final num providerPreferenceCount;
  final List<String> signals;
  final RelevanceMemoryGuidanceDtoStatusStatus status;

  Map<String, Object?> toJson() => _$RelevanceMemoryGuidanceDtoToJson(this);
}
