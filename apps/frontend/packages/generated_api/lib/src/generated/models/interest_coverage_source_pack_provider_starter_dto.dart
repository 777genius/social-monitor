// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'interest_coverage_source_pack_provider_starter_dto.g.dart';

@JsonSerializable()
class InterestCoverageSourcePackProviderStarterDto {
  const InterestCoverageSourcePackProviderStarterDto({
    required this.keywords,
    required this.label,
    required this.languages,
    required this.providerKey,
    required this.queries,
    required this.rssFeedUrls,
    required this.subreddits,
    required this.topics,
  });

  factory InterestCoverageSourcePackProviderStarterDto.fromJson(
    Map<String, Object?> json,
  ) => _$InterestCoverageSourcePackProviderStarterDtoFromJson(json);

  final List<String> keywords;
  final String label;
  final List<String> languages;
  final String providerKey;
  final List<String> queries;
  final List<String> rssFeedUrls;
  final List<String> subreddits;
  final List<String> topics;

  Map<String, Object?> toJson() =>
      _$InterestCoverageSourcePackProviderStarterDtoToJson(this);
}
