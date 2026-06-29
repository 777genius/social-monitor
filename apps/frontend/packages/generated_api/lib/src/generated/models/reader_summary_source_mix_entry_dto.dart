// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_source_mix_entry_dto.g.dart';

@JsonSerializable()
class ReaderSummarySourceMixEntryDto {
  const ReaderSummarySourceMixEntryDto({
    required this.citationCount,
    required this.crossSourceClusterCount,
    required this.interestIds,
    required this.itemCount,
    required this.providerKey,
    required this.singleSourceOnly,
    required this.storyClusterCount,
  });

  factory ReaderSummarySourceMixEntryDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummarySourceMixEntryDtoFromJson(json);

  final num citationCount;
  final num crossSourceClusterCount;
  final List<String> interestIds;
  final num itemCount;
  final String providerKey;
  final bool singleSourceOnly;
  final num storyClusterCount;

  Map<String, Object?> toJson() => _$ReaderSummarySourceMixEntryDtoToJson(this);
}
