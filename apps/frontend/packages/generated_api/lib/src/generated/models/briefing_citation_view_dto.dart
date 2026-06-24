// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_citation_view_dto_field_field.dart';

part 'briefing_citation_view_dto.g.dart';

@JsonSerializable()
class BriefingCitationViewDto {
  const BriefingCitationViewDto({
    required this.citationId,
    required this.feedItemId,
    required this.field,
    required this.label,
    required this.providerKey,
    required this.sourceItemId,
    this.canonicalUrl,
  });

  factory BriefingCitationViewDto.fromJson(Map<String, Object?> json) =>
      _$BriefingCitationViewDtoFromJson(json);

  final String? canonicalUrl;
  final String citationId;
  final String feedItemId;
  final BriefingCitationViewDtoFieldField field;
  final String label;
  final String providerKey;
  final String sourceItemId;

  Map<String, Object?> toJson() => _$BriefingCitationViewDtoToJson(this);
}
