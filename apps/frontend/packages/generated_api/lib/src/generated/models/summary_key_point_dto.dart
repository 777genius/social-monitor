// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'summary_key_point_dto.g.dart';

@JsonSerializable()
class SummaryKeyPointDto {
  const SummaryKeyPointDto({required this.citationIds, required this.claim});

  factory SummaryKeyPointDto.fromJson(Map<String, Object?> json) =>
      _$SummaryKeyPointDtoFromJson(json);

  final List<String> citationIds;
  final String claim;

  Map<String, Object?> toJson() => _$SummaryKeyPointDtoToJson(this);
}
