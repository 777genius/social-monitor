// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_post_dto.g.dart';

@JsonSerializable()
class ReaderPostDto {
  const ReaderPostDto({
    required this.bodyPreview,
    required this.canonicalUrl,
    required this.engagement,
    required this.engagementObservedAt,
    required this.id,
    required this.providerFamily,
    required this.providerKey,
    required this.publishedAt,
    required this.relevance,
    required this.sourceItemId,
    required this.title,
    required this.usefulness,
    this.likeCount,
    this.quotedContext,
  });

  factory ReaderPostDto.fromJson(Map<String, Object?> json) =>
      _$ReaderPostDtoFromJson(json);

  final String bodyPreview;
  final String canonicalUrl;
  final num? engagement;
  final String? engagementObservedAt;
  final String id;

  /// Raw X like count for Likes display and sorting; null when unknown, omitted for other providers. Reposts are excluded.
  final num? likeCount;
  final String providerFamily;
  final String providerKey;
  final String publishedAt;

  /// Whether the original quoted post text was captured; the author text is assessed separately
  final String? quotedContext;
  final String? relevance;
  final String sourceItemId;
  final String title;
  final String? usefulness;

  Map<String, Object?> toJson() => _$ReaderPostDtoToJson(this);
}
