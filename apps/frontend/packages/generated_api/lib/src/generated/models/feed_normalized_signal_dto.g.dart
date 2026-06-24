// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feed_normalized_signal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeedNormalizedSignalDto _$FeedNormalizedSignalDtoFromJson(
  Map<String, dynamic> json,
) => FeedNormalizedSignalDto(
  band: FeedNormalizedSignalDtoBandBand.fromJson(json['band'] as String),
  basis: FeedNormalizedSignalDtoBasisBasis.fromJson(json['basis'] as String),
  cohort: FeedSignalCohortDto.fromJson(json['cohort'] as Map<String, dynamic>),
  computedAt: DateTime.parse(json['computedAt'] as String),
  confidence: json['confidence'] as num,
  score: json['score'] as num,
);

Map<String, dynamic> _$FeedNormalizedSignalDtoToJson(
  FeedNormalizedSignalDto instance,
) => <String, dynamic>{
  'band': instance.band,
  'basis': instance.basis,
  'cohort': instance.cohort,
  'computedAt': instance.computedAt.toIso8601String(),
  'confidence': instance.confidence,
  'score': instance.score,
};
