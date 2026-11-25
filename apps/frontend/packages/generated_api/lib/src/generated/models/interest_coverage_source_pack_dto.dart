// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'interest_coverage_source_pack_provider_starter_dto.dart';

part 'interest_coverage_source_pack_dto.g.dart';

@JsonSerializable()
class InterestCoverageSourcePackDto {
  const InterestCoverageSourcePackDto({
    required this.description,
    required this.displayName,
    required this.key,
    required this.providerStarters,
  });

  factory InterestCoverageSourcePackDto.fromJson(Map<String, Object?> json) =>
      _$InterestCoverageSourcePackDtoFromJson(json);

  final String description;
  final String displayName;
  final String key;
  final List<InterestCoverageSourcePackProviderStarterDto> providerStarters;

  Map<String, Object?> toJson() => _$InterestCoverageSourcePackDtoToJson(this);
}
