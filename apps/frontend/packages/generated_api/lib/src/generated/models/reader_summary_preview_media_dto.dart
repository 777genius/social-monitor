// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_preview_media_dto_kind_kind.dart';

part 'reader_summary_preview_media_dto.g.dart';

@JsonSerializable()
class ReaderSummaryPreviewMediaDto {
  const ReaderSummaryPreviewMediaDto({
    required this.kind,
    required this.url,
    this.altText,
    this.sourceUrl,
  });

  factory ReaderSummaryPreviewMediaDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryPreviewMediaDtoFromJson(json);

  final String? altText;
  final ReaderSummaryPreviewMediaDtoKindKind kind;
  final String? sourceUrl;
  final String url;

  Map<String, Object?> toJson() => _$ReaderSummaryPreviewMediaDtoToJson(this);
}
