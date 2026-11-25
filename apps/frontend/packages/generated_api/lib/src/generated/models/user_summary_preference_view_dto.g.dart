// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_summary_preference_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserSummaryPreferenceViewDto _$UserSummaryPreferenceViewDtoFromJson(
  Map<String, dynamic> json,
) => UserSummaryPreferenceViewDto(
  createdAt: DateTime.parse(json['createdAt'] as String),
  id: json['id'] as String,
  rulesVersion: json['rulesVersion'] as String,
  tenantId: json['tenantId'] as String,
  updatedAt: DateTime.parse(json['updatedAt'] as String),
  userId: json['userId'] as String,
  workspaceId: json['workspaceId'] as String,
  customInstructions: json['customInstructions'] as String?,
  format: json['format'] == null
      ? null
      : UserSummaryPreferenceViewDtoFormatFormat.fromJson(
          json['format'] as String,
        ),
  includeRisks: json['includeRisks'] as bool?,
  includeSourceHighlights: json['includeSourceHighlights'] as bool?,
  interestId: json['interestId'] as String?,
  language: json['language'] == null
      ? null
      : UserSummaryPreferenceViewDtoLanguageLanguage.fromJson(
          json['language'] as String,
        ),
  maxKeyPoints: json['maxKeyPoints'] as num?,
  subscriptionId: json['subscriptionId'] as String?,
  tone: json['tone'] == null
      ? null
      : UserSummaryPreferenceViewDtoToneTone.fromJson(json['tone'] as String),
);

Map<String, dynamic> _$UserSummaryPreferenceViewDtoToJson(
  UserSummaryPreferenceViewDto instance,
) => <String, dynamic>{
  'createdAt': instance.createdAt.toIso8601String(),
  'customInstructions': instance.customInstructions,
  'format': instance.format,
  'id': instance.id,
  'includeRisks': instance.includeRisks,
  'includeSourceHighlights': instance.includeSourceHighlights,
  'interestId': instance.interestId,
  'language': instance.language,
  'maxKeyPoints': instance.maxKeyPoints,
  'rulesVersion': instance.rulesVersion,
  'subscriptionId': instance.subscriptionId,
  'tenantId': instance.tenantId,
  'tone': instance.tone,
  'updatedAt': instance.updatedAt.toIso8601String(),
  'userId': instance.userId,
  'workspaceId': instance.workspaceId,
};
