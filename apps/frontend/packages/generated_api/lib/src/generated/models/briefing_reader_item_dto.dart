// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_provider_metric_dto.dart';

part 'briefing_reader_item_dto.g.dart';

@JsonSerializable()
class BriefingReaderItemDto {
  const BriefingReaderItemDto({
    required this.citationIds,
    required this.matchedRules,
    required this.matchedTopicIds,
    required this.providerKey,
    required this.providerMetrics,
    required this.reason,
    required this.signalScore,
    required this.title,
    required this.whyImportant,
    required this.whyNow,
    this.canonicalUrl,
  });

  factory BriefingReaderItemDto.fromJson(Map<String, Object?> json) =>
      _$BriefingReaderItemDtoFromJson(json);

  final String? canonicalUrl;
  final List<String> citationIds;
  final List<String> matchedRules;
  final List<String> matchedTopicIds;
  final String providerKey;
  final List<BriefingProviderMetricDto> providerMetrics;
  final String reason;
  final num signalScore;
  final String title;
  final List<String> whyImportant;
  final String whyNow;

  Map<String, Object?> toJson() => _$BriefingReaderItemDtoToJson(this);
}
