// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'upsert_interest_user_summary_preference_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpsertInterestUserSummaryPreferenceRequestDto
_$UpsertInterestUserSummaryPreferenceRequestDtoFromJson(
  Map<String, dynamic> json,
) => UpsertInterestUserSummaryPreferenceRequestDto(
  userId: json['userId'] as String,
  customInstructions: json['customInstructions'] as String?,
  format: json['format'] == null
      ? null
      : UpsertInterestUserSummaryPreferenceRequestDtoFormatFormat.fromJson(
          json['format'] as String,
        ),
  includeRisks: json['includeRisks'] as bool?,
  includeSourceHighlights: json['includeSourceHighlights'] as bool?,
  language: json['language'] == null
      ? null
      : UpsertInterestUserSummaryPreferenceRequestDtoLanguageLanguage.fromJson(
          json['language'] as String,
        ),
  maxKeyPoints: json['maxKeyPoints'] as num?,
  tone: json['tone'] == null
      ? null
      : UpsertInterestUserSummaryPreferenceRequestDtoToneTone.fromJson(
          json['tone'] as String,
        ),
);

Map<String, dynamic> _$UpsertInterestUserSummaryPreferenceRequestDtoToJson(
  UpsertInterestUserSummaryPreferenceRequestDto instance,
) => <String, dynamic>{
  'customInstructions': instance.customInstructions,
  'format': instance.format,
  'includeRisks': instance.includeRisks,
  'includeSourceHighlights': instance.includeSourceHighlights,
  'language': instance.language,
  'maxKeyPoints': instance.maxKeyPoints,
  'tone': instance.tone,
  'userId': instance.userId,
};
