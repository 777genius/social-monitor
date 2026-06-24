// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'briefing_source_mix_entry_dto.g.dart';

@JsonSerializable()
class BriefingSourceMixEntryDto {
  const BriefingSourceMixEntryDto({
    required this.citationCount,
    required this.crossSourceClusterCount,
    required this.itemCount,
    required this.providerKey,
    required this.singleSourceOnly,
    required this.storyClusterCount,
    required this.topicIds,
  });

  factory BriefingSourceMixEntryDto.fromJson(Map<String, Object?> json) =>
      _$BriefingSourceMixEntryDtoFromJson(json);

  final num citationCount;
  final num crossSourceClusterCount;
  final num itemCount;
  final String providerKey;
  final bool singleSourceOnly;
  final num storyClusterCount;
  final List<String> topicIds;

  Map<String, Object?> toJson() => _$BriefingSourceMixEntryDtoToJson(this);
}
