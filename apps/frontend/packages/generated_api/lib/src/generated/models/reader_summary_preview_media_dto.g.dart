// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_preview_media_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPreviewMediaDto _$ReaderSummaryPreviewMediaDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryPreviewMediaDto(
  kind: ReaderSummaryPreviewMediaDtoKindKind.fromJson(json['kind'] as String),
  url: json['url'] as String,
  altText: json['altText'] as String?,
  sourceUrl: json['sourceUrl'] as String?,
);

Map<String, dynamic> _$ReaderSummaryPreviewMediaDtoToJson(
  ReaderSummaryPreviewMediaDto instance,
) => <String, dynamic>{
  'altText': instance.altText,
  'kind': instance.kind,
  'sourceUrl': instance.sourceUrl,
  'url': instance.url,
};
