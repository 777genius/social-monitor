// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'interest_coverage_source_pack_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InterestCoverageSourcePackDto _$InterestCoverageSourcePackDtoFromJson(
  Map<String, dynamic> json,
) => InterestCoverageSourcePackDto(
  description: json['description'] as String,
  displayName: json['displayName'] as String,
  key: json['key'] as String,
  providerStarters: (json['providerStarters'] as List<dynamic>)
      .map(
        (e) => InterestCoverageSourcePackProviderStarterDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
);

Map<String, dynamic> _$InterestCoverageSourcePackDtoToJson(
  InterestCoverageSourcePackDto instance,
) => <String, dynamic>{
  'description': instance.description,
  'displayName': instance.displayName,
  'key': instance.key,
  'providerStarters': instance.providerStarters,
};
