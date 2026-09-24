// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_promotion_v3_presentation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryPromotionV3PresentationDto
_$ReaderSummaryPromotionV3PresentationDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryPromotionV3PresentationDto(
  displayHeadline: ReaderSummaryDisplayHeadlineSealDto.fromJson(
    json['displayHeadline'] as Map<String, dynamic>,
  ),
  presentationInputDigest: json['presentationInputDigest'] as String,
  presentationIdentity: json['presentationIdentity'] as String,
  schemaVersion:
      ReaderSummaryPromotionV3PresentationDtoSchemaVersionSchemaVersion.fromJson(
        json['schemaVersion'] as String,
      ),
);

Map<String, dynamic> _$ReaderSummaryPromotionV3PresentationDtoToJson(
  ReaderSummaryPromotionV3PresentationDto instance,
) => <String, dynamic>{
  'displayHeadline': instance.displayHeadline,
  'presentationInputDigest': instance.presentationInputDigest,
  'presentationIdentity': instance.presentationIdentity,
  'schemaVersion': instance.schemaVersion,
};
