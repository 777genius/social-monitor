// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_accepted_topic_reversion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryAcceptedTopicReversionDto
_$ReaderSummaryAcceptedTopicReversionDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryAcceptedTopicReversionDto(
      revertedSourceBindingCount: json['revertedSourceBindingCount'] as num,
      sourceBindingReversions:
          (json['sourceBindingReversions'] as List<dynamic>)
              .map(
                (e) => ReaderSummaryAcceptedTopicReversionBindingDto.fromJson(
                  e as Map<String, dynamic>,
                ),
              )
              .toList(),
      status: ReaderSummaryAcceptedTopicReversionDtoStatusStatus.fromJson(
        json['status'] as String,
      ),
    );

Map<String, dynamic> _$ReaderSummaryAcceptedTopicReversionDtoToJson(
  ReaderSummaryAcceptedTopicReversionDto instance,
) => <String, dynamic>{
  'revertedSourceBindingCount': instance.revertedSourceBindingCount,
  'sourceBindingReversions': instance.sourceBindingReversions,
  'status': instance.status,
};
