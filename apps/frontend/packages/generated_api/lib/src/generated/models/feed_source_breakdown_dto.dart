// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'feed_source_breakdown_entry_dto.dart';

part 'feed_source_breakdown_dto.g.dart';

@JsonSerializable()
class FeedSourceBreakdownDto {
  const FeedSourceBreakdownDto({
    required this.providerCount,
    required this.sourceCount,
    required this.sources,
    required this.totalItems,
  });

  factory FeedSourceBreakdownDto.fromJson(Map<String, Object?> json) =>
      _$FeedSourceBreakdownDtoFromJson(json);

  final num providerCount;
  final num sourceCount;
  final List<FeedSourceBreakdownEntryDto> sources;
  final num totalItems;

  Map<String, Object?> toJson() => _$FeedSourceBreakdownDtoToJson(this);
}
