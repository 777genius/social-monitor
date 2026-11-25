// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_captured_source_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryCapturedSourceDto _$ReaderSummaryCapturedSourceDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryCapturedSourceDto(
  captureAvailability:
      ReaderSummaryCapturedSourceDtoCaptureAvailabilityCaptureAvailability.fromJson(
        json['captureAvailability'] as String,
      ),
  reviewAvailability:
      ReaderSummaryCapturedSourceDtoReviewAvailabilityReviewAvailability.fromJson(
        json['reviewAvailability'] as String,
      ),
  title: json['title'] as String,
  body: json['body'] as String?,
);

Map<String, dynamic> _$ReaderSummaryCapturedSourceDtoToJson(
  ReaderSummaryCapturedSourceDto instance,
) => <String, dynamic>{
  'body': instance.body,
  'captureAvailability': instance.captureAvailability,
  'reviewAvailability': instance.reviewAvailability,
  'title': instance.title,
};
