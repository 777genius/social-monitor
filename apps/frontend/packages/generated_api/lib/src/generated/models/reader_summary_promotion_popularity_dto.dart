// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_promotion_popularity_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPromotionPopularityDto {
  const ReaderSummaryPromotionPopularityDto({
    required this.below,
    required this.cohortSize,
    required this.equal,
  });

  factory ReaderSummaryPromotionPopularityDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryPromotionPopularityDtoFromJson(json);

  final num below;
  final num cohortSize;
  final num equal;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryPromotionPopularityDtoToJson(this);
}
