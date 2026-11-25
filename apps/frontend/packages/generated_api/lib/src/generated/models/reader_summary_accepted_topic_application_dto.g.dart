// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_accepted_topic_application_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryAcceptedTopicApplicationDto
_$ReaderSummaryAcceptedTopicApplicationDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryAcceptedTopicApplicationDto(
      changedSourceBindingCount: json['changedSourceBindingCount'] as num,
      sourceBindingUpdates: (json['sourceBindingUpdates'] as List<dynamic>)
          .map(
            (e) => ReaderSummaryAcceptedTopicApplicationBindingDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      status: ReaderSummaryAcceptedTopicApplicationDtoStatusStatus.fromJson(
        json['status'] as String,
      ),
    );

Map<String, dynamic> _$ReaderSummaryAcceptedTopicApplicationDtoToJson(
  ReaderSummaryAcceptedTopicApplicationDto instance,
) => <String, dynamic>{
  'changedSourceBindingCount': instance.changedSourceBindingCount,
  'sourceBindingUpdates': instance.sourceBindingUpdates,
  'status': instance.status,
};
