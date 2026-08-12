// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_weekly_projection_evidence_limitation_dto_evidence_state_evidence_state.dart';
import 'reader_summary_weekly_projection_evidence_limitation_dto_provider_key_provider_key.dart';

part 'reader_summary_weekly_projection_evidence_limitation_dto.g.dart';

@JsonSerializable()
class ReaderSummaryWeeklyProjectionEvidenceLimitationDto {
  const ReaderSummaryWeeklyProjectionEvidenceLimitationDto({
    required this.evidenceState,
    required this.providerKey,
    required this.requestedUtcDate,
  });

  factory ReaderSummaryWeeklyProjectionEvidenceLimitationDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryWeeklyProjectionEvidenceLimitationDtoFromJson(json);

  final ReaderSummaryWeeklyProjectionEvidenceLimitationDtoEvidenceStateEvidenceState
  evidenceState;
  final ReaderSummaryWeeklyProjectionEvidenceLimitationDtoProviderKeyProviderKey
  providerKey;
  final String requestedUtcDate;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryWeeklyProjectionEvidenceLimitationDtoToJson(this);
}
