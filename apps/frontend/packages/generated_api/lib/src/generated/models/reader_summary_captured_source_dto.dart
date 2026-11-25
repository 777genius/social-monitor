// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_captured_source_dto_capture_availability_capture_availability.dart';
import 'reader_summary_captured_source_dto_review_availability_review_availability.dart';

part 'reader_summary_captured_source_dto.g.dart';

@JsonSerializable()
class ReaderSummaryCapturedSourceDto {
  const ReaderSummaryCapturedSourceDto({
    required this.captureAvailability,
    required this.reviewAvailability,
    required this.title,
    this.body,
  });

  factory ReaderSummaryCapturedSourceDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryCapturedSourceDtoFromJson(json);

  final String? body;
  final ReaderSummaryCapturedSourceDtoCaptureAvailabilityCaptureAvailability
  captureAvailability;
  final ReaderSummaryCapturedSourceDtoReviewAvailabilityReviewAvailability
  reviewAvailability;
  final String title;

  Map<String, Object?> toJson() => _$ReaderSummaryCapturedSourceDtoToJson(this);
}
