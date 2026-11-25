// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_promotion_engagement_dto_method_method.dart';

part 'reader_summary_promotion_engagement_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPromotionEngagementDto {
  const ReaderSummaryPromotionEngagementDto({
    required this.method,
    required this.observedAt,
    required this.value,
  });

  factory ReaderSummaryPromotionEngagementDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryPromotionEngagementDtoFromJson(json);

  final ReaderSummaryPromotionEngagementDtoMethodMethod method;
  final String observedAt;

  /// Provider signal; integer except GitHub half forks (x.5).
  final num value;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryPromotionEngagementDtoToJson(this);
}
