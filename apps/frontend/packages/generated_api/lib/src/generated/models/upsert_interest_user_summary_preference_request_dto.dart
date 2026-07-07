// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'upsert_interest_user_summary_preference_request_dto_format_format.dart';
import 'upsert_interest_user_summary_preference_request_dto_language_language.dart';
import 'upsert_interest_user_summary_preference_request_dto_tone_tone.dart';

part 'upsert_interest_user_summary_preference_request_dto.g.dart';

@JsonSerializable()
class UpsertInterestUserSummaryPreferenceRequestDto {
  const UpsertInterestUserSummaryPreferenceRequestDto({
    required this.userId,
    this.customInstructions,
    this.format,
    this.includeRisks,
    this.includeSourceHighlights,
    this.language,
    this.maxKeyPoints,
    this.tone,
  });

  factory UpsertInterestUserSummaryPreferenceRequestDto.fromJson(
    Map<String, Object?> json,
  ) => _$UpsertInterestUserSummaryPreferenceRequestDtoFromJson(json);

  final String? customInstructions;
  final UpsertInterestUserSummaryPreferenceRequestDtoFormatFormat? format;
  final bool? includeRisks;
  final bool? includeSourceHighlights;
  final UpsertInterestUserSummaryPreferenceRequestDtoLanguageLanguage? language;
  final num? maxKeyPoints;
  final UpsertInterestUserSummaryPreferenceRequestDtoToneTone? tone;
  final String userId;

  Map<String, Object?> toJson() =>
      _$UpsertInterestUserSummaryPreferenceRequestDtoToJson(this);
}
