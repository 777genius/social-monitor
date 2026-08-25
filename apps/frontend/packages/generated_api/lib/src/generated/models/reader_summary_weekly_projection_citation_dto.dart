// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_weekly_projection_citation_dto.g.dart';

@JsonSerializable()
class ReaderSummaryWeeklyProjectionCitationDto {
  const ReaderSummaryWeeklyProjectionCitationDto({
    required this.canonicalUrl,
    required this.citationId,
    required this.feedItemId,
    required this.providerItemId,
    required this.providerKey,
    required this.publicationId,
    required this.requestedUtcDate,
    required this.sourceBindingId,
    required this.sourceContentHash,
    required this.sourceItemId,
  });

  factory ReaderSummaryWeeklyProjectionCitationDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryWeeklyProjectionCitationDtoFromJson(json);

  final String canonicalUrl;
  final String citationId;
  final String feedItemId;
  final String providerItemId;
  final String providerKey;
  final String publicationId;
  final String requestedUtcDate;
  final String sourceBindingId;
  final String sourceContentHash;
  final String sourceItemId;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryWeeklyProjectionCitationDtoToJson(this);
}
