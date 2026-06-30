// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'interest_coverage_source_pack_provider_starter_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InterestCoverageSourcePackProviderStarterDto
_$InterestCoverageSourcePackProviderStarterDtoFromJson(
  Map<String, dynamic> json,
) => InterestCoverageSourcePackProviderStarterDto(
  keywords: (json['keywords'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  label: json['label'] as String,
  languages: (json['languages'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  providerKey: json['providerKey'] as String,
  queries: (json['queries'] as List<dynamic>).map((e) => e as String).toList(),
  rssFeedUrls: (json['rssFeedUrls'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  subreddits: (json['subreddits'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  topics: (json['topics'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$InterestCoverageSourcePackProviderStarterDtoToJson(
  InterestCoverageSourcePackProviderStarterDto instance,
) => <String, dynamic>{
  'keywords': instance.keywords,
  'label': instance.label,
  'languages': instance.languages,
  'providerKey': instance.providerKey,
  'queries': instance.queries,
  'rssFeedUrls': instance.rssFeedUrls,
  'subreddits': instance.subreddits,
  'topics': instance.topics,
};
