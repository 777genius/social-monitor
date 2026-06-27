// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_provider_metric_dto.g.dart';

@JsonSerializable()
class ReaderSummaryProviderMetricDto {
  const ReaderSummaryProviderMetricDto({
    required this.label,
    required this.value,
  });

  factory ReaderSummaryProviderMetricDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryProviderMetricDtoFromJson(json);

  final String label;
  final String value;

  Map<String, Object?> toJson() => _$ReaderSummaryProviderMetricDtoToJson(this);
}
