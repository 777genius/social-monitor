// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_citation_view_dto_field_field.dart';

part 'reader_summary_citation_view_dto.g.dart';

@JsonSerializable()
class ReaderSummaryCitationViewDto {
  const ReaderSummaryCitationViewDto({
    required this.citationId,
    required this.feedItemId,
    required this.field,
    required this.label,
    required this.providerKey,
    required this.sourceItemId,
    this.canonicalUrl,
  });

  factory ReaderSummaryCitationViewDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryCitationViewDtoFromJson(json);

  final String? canonicalUrl;
  final String citationId;
  final String feedItemId;
  final ReaderSummaryCitationViewDtoFieldField field;
  final String label;
  final String providerKey;
  final String sourceItemId;

  Map<String, Object?> toJson() => _$ReaderSummaryCitationViewDtoToJson(this);
}
