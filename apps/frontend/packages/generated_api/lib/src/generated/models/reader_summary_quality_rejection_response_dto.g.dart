// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_quality_rejection_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryQualityRejectionResponseDto
_$ReaderSummaryQualityRejectionResponseDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryQualityRejectionResponseDto(
  canonicalScore: json['canonicalScore'] as num,
  citations: (json['citations'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryQualityRejectionCitationDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  failureClass:
      ReaderSummaryQualityRejectionResponseDtoFailureClassFailureClass.fromJson(
        json['failureClass'] as String,
      ),
  headline: json['headline'] as String,
  period: ReaderSummaryPeriodDto.fromJson(
    json['period'] as Map<String, dynamic>,
  ),
  readerSummaryId: json['readerSummaryId'] as String,
  readerSummaryJobId: json['readerSummaryJobId'] as String,
  reasonCodes: (json['reasonCodes'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  reasons: (json['reasons'] as List<dynamic>).map((e) => e as String).toList(),
  scope: ReaderSummaryScopeDto.fromJson(json['scope'] as Map<String, dynamic>),
  shadow: ReaderSummaryQualityRejectionShadowDto.fromJson(
    json['shadow'] as Map<String, dynamic>,
  ),
  topReads: (json['topReads'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryQualityRejectionTopReadDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  violations: (json['violations'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryQualityRejectionViolationDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
);

Map<String, dynamic> _$ReaderSummaryQualityRejectionResponseDtoToJson(
  ReaderSummaryQualityRejectionResponseDto instance,
) => <String, dynamic>{
  'canonicalScore': instance.canonicalScore,
  'citations': instance.citations,
  'failureClass': instance.failureClass,
  'headline': instance.headline,
  'period': instance.period,
  'readerSummaryId': instance.readerSummaryId,
  'readerSummaryJobId': instance.readerSummaryJobId,
  'reasonCodes': instance.reasonCodes,
  'reasons': instance.reasons,
  'scope': instance.scope,
  'shadow': instance.shadow,
  'topReads': instance.topReads,
  'violations': instance.violations,
};
