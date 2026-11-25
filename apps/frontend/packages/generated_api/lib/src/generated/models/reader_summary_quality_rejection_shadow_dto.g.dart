// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_quality_rejection_shadow_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryQualityRejectionShadowDto
_$ReaderSummaryQualityRejectionShadowDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryQualityRejectionShadowDto(
      mode: ReaderSummaryQualityRejectionShadowDtoModeMode.fromJson(
        json['mode'] as String,
      ),
      riskScore: json['riskScore'] as num,
      signals: (json['signals'] as List<dynamic>)
          .map(
            (e) => ReaderSummaryQualityRejectionShadowSignalDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
    );

Map<String, dynamic> _$ReaderSummaryQualityRejectionShadowDtoToJson(
  ReaderSummaryQualityRejectionShadowDto instance,
) => <String, dynamic>{
  'mode': instance.mode,
  'riskScore': instance.riskScore,
  'signals': instance.signals,
};
