// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'record_post_rating_request_dto_reason_reason.dart';

part 'record_post_rating_request_dto.g.dart';

@JsonSerializable()
class RecordPostRatingRequestDto {
  const RecordPostRatingRequestDto({
    required this.idempotencyKey,
    required this.interestId,
    required this.providerKey,
    required this.rating,
    required this.title,
    this.bodyPreview,
    this.canonicalUrl,
    this.feedItemId,
    this.reason,
    this.sourceItemId,
  });

  factory RecordPostRatingRequestDto.fromJson(Map<String, Object?> json) =>
      _$RecordPostRatingRequestDtoFromJson(json);

  final String? bodyPreview;
  final String? canonicalUrl;
  final String? feedItemId;
  final String idempotencyKey;
  final String interestId;
  final String providerKey;
  final num rating;
  final RecordPostRatingRequestDtoReasonReason? reason;
  final String? sourceItemId;
  final String title;

  Map<String, Object?> toJson() => _$RecordPostRatingRequestDtoToJson(this);
}
