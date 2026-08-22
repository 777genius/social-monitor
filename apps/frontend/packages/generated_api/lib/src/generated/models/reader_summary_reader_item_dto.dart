// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_preview_media_dto.dart';
import 'reader_summary_promotion_attestation_dto.dart';
import 'reader_summary_provider_metric_dto.dart';
import 'reader_summary_reader_item_confidence_dto.dart';
import 'reader_summary_reader_item_dto_primary_action_kind_primary_action_kind.dart';

part 'reader_summary_reader_item_dto.g.dart';

@JsonSerializable()
class ReaderSummaryReaderItemDto {
  const ReaderSummaryReaderItemDto({
    required this.citationIds,
    required this.confidence,
    required this.confirmedProviderKeys,
    required this.matchedInterestIds,
    required this.matchedRules,
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
    this.previewMedia,
    this.promotionAttestation,
    this.publishedAt,
  });

  factory ReaderSummaryReaderItemDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryReaderItemDtoFromJson(json);

  final String? canonicalUrl;
  final List<String> citationIds;
  final ReaderSummaryReaderItemConfidenceDto confidence;
  final List<String> confirmedProviderKeys;
  final List<String> matchedInterestIds;
  final List<String> matchedRules;
  final ReaderSummaryPreviewMediaDto? previewMedia;
  final ReaderSummaryReaderItemDtoPrimaryActionKindPrimaryActionKind
  primaryActionKind;
  final ReaderSummaryPromotionAttestationDto? promotionAttestation;
  final String providerKey;
  final List<ReaderSummaryProviderMetricDto> providerMetrics;
  final String providerName;
  final DateTime? publishedAt;
  final String reason;
  final num signalScore;
  final String title;
  final List<String> whyImportant;
  final String whyNow;

  Map<String, Object?> toJson() => _$ReaderSummaryReaderItemDtoToJson(this);
}
