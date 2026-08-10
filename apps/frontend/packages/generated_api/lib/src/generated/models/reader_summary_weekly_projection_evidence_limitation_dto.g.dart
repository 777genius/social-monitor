// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_weekly_projection_evidence_limitation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryWeeklyProjectionEvidenceLimitationDto
_$ReaderSummaryWeeklyProjectionEvidenceLimitationDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryWeeklyProjectionEvidenceLimitationDto(
  evidenceState:
      ReaderSummaryWeeklyProjectionEvidenceLimitationDtoEvidenceStateEvidenceState.fromJson(
        json['evidenceState'] as String,
      ),
  providerKey:
      ReaderSummaryWeeklyProjectionEvidenceLimitationDtoProviderKeyProviderKey.fromJson(
        json['providerKey'] as String,
      ),
  requestedUtcDate: json['requestedUtcDate'] as String,
);

Map<String, dynamic> _$ReaderSummaryWeeklyProjectionEvidenceLimitationDtoToJson(
  ReaderSummaryWeeklyProjectionEvidenceLimitationDto instance,
) => <String, dynamic>{
  'evidenceState': instance.evidenceState,
  'providerKey': instance.providerKey,
  'requestedUtcDate': instance.requestedUtcDate,
};
