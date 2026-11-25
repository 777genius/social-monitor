// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_personalization_dto_memory_guidance_status_memory_guidance_status.dart';

part 'reader_summary_personalization_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPersonalizationDto {
  const ReaderSummaryPersonalizationDto({
    required this.blockedProviderCount,
    required this.keywordPreferenceCount,
    required this.memoryGuidanceApplied,
    required this.memoryGuidanceStatus,
    required this.mutedKeywordCount,
    required this.providerPreferenceCount,
    required this.signals,
  });

  factory ReaderSummaryPersonalizationDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryPersonalizationDtoFromJson(json);

  final num blockedProviderCount;
  final num keywordPreferenceCount;
  final bool memoryGuidanceApplied;
  final ReaderSummaryPersonalizationDtoMemoryGuidanceStatusMemoryGuidanceStatus
  memoryGuidanceStatus;
  final num mutedKeywordCount;
  final num providerPreferenceCount;
  final List<String> signals;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryPersonalizationDtoToJson(this);
}
