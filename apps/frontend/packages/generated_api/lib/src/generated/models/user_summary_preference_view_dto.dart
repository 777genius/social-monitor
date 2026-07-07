// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'user_summary_preference_view_dto_format_format.dart';
import 'user_summary_preference_view_dto_language_language.dart';
import 'user_summary_preference_view_dto_tone_tone.dart';

part 'user_summary_preference_view_dto.g.dart';

@JsonSerializable()
class UserSummaryPreferenceViewDto {
  const UserSummaryPreferenceViewDto({
    required this.createdAt,
    required this.id,
    required this.rulesVersion,
    required this.tenantId,
    required this.updatedAt,
    required this.userId,
    required this.workspaceId,
    this.customInstructions,
    this.format,
    this.includeRisks,
    this.includeSourceHighlights,
    this.interestId,
    this.language,
    this.maxKeyPoints,
    this.subscriptionId,
    this.tone,
  });

  factory UserSummaryPreferenceViewDto.fromJson(Map<String, Object?> json) =>
      _$UserSummaryPreferenceViewDtoFromJson(json);

  final DateTime createdAt;
  final String? customInstructions;
  final UserSummaryPreferenceViewDtoFormatFormat? format;
  final String id;
  final bool? includeRisks;
  final bool? includeSourceHighlights;
  final String? interestId;
  final UserSummaryPreferenceViewDtoLanguageLanguage? language;
  final num? maxKeyPoints;
  final String rulesVersion;
  final String? subscriptionId;
  final String tenantId;
  final UserSummaryPreferenceViewDtoToneTone? tone;
  final DateTime updatedAt;
  final String userId;
  final String workspaceId;

  Map<String, Object?> toJson() => _$UserSummaryPreferenceViewDtoToJson(this);
}
