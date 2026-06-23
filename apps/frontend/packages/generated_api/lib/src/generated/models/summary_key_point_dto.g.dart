// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'summary_key_point_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SummaryKeyPointDto _$SummaryKeyPointDtoFromJson(Map<String, dynamic> json) =>
    SummaryKeyPointDto(
      citationIds: (json['citationIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      claim: json['claim'] as String,
    );

Map<String, dynamic> _$SummaryKeyPointDtoToJson(SummaryKeyPointDto instance) =>
    <String, dynamic>{
      'citationIds': instance.citationIds,
      'claim': instance.claim,
    };
