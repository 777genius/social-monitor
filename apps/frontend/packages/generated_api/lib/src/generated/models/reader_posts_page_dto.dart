// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_post_dto.dart';

part 'reader_posts_page_dto.g.dart';

@JsonSerializable()
class ReaderPostsPageDto {
  const ReaderPostsPageDto({
    required this.items,
    required this.providerKeys,
    required this.total,
    this.nextCursor,
  });

  factory ReaderPostsPageDto.fromJson(Map<String, Object?> json) =>
      _$ReaderPostsPageDtoFromJson(json);

  final List<ReaderPostDto> items;
  final String? nextCursor;
  final List<String> providerKeys;
  final num total;

  Map<String, Object?> toJson() => _$ReaderPostsPageDtoToJson(this);
}
