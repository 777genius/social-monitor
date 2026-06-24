// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'feed_signal_cohort_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FeedSignalCohortDto _$FeedSignalCohortDtoFromJson(Map<String, dynamic> json) =>
    FeedSignalCohortDto(
      ageBucket: json['ageBucket'] as String,
      baselineWindow: FeedSignalCohortDtoBaselineWindowBaselineWindow.fromJson(
        json['baselineWindow'] as String,
      ),
      contentType: json['contentType'] as String,
      fallback: FeedSignalCohortDtoFallbackFallback.fromJson(
        json['fallback'] as String,
      ),
      percentile: json['percentile'] as num,
      providerKey: json['providerKey'] as String,
      sampleSize: json['sampleSize'] as num,
      sourceKey: json['sourceKey'] as String,
      zScore: json['zScore'] as num,
    );

Map<String, dynamic> _$FeedSignalCohortDtoToJson(
  FeedSignalCohortDto instance,
) => <String, dynamic>{
  'ageBucket': instance.ageBucket,
  'baselineWindow': instance.baselineWindow,
  'contentType': instance.contentType,
  'fallback': instance.fallback,
  'percentile': instance.percentile,
  'providerKey': instance.providerKey,
  'sampleSize': instance.sampleSize,
  'sourceKey': instance.sourceKey,
  'zScore': instance.zScore,
};
