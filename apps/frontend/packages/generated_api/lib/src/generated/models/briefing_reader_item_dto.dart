// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_provider_metric_dto.dart';
import 'briefing_reader_item_confidence_dto.dart';
import 'briefing_reader_item_dto_primary_action_kind_primary_action_kind.dart';

part 'briefing_reader_item_dto.g.dart';

@JsonSerializable()
class BriefingReaderItemDto {
  const BriefingReaderItemDto({
    required this.citationIds,
    required this.confidence,
    required this.confirmedProviderKeys,
    required this.matchedRules,
    required this.matchedTopicIds,
    required this.primaryActionKind,
    required this.providerKey,
    required this.providerMetrics,
    required this.providerName,
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
  final BriefingReaderItemConfidenceDto confidence;
  final List<String> confirmedProviderKeys;
  final List<String> matchedRules;
  final List<String> matchedTopicIds;
  final BriefingReaderItemDtoPrimaryActionKindPrimaryActionKind
  primaryActionKind;
  final String providerKey;
  final List<BriefingProviderMetricDto> providerMetrics;
  final String providerName;
  final String reason;
  final num signalScore;
  final String title;
  final List<String> whyImportant;
  final String whyNow;

  Map<String, Object?> toJson() => _$BriefingReaderItemDtoToJson(this);
}
