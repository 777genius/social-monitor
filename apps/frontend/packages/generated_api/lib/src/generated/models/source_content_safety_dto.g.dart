// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_content_safety_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceContentSafetyDto _$SourceContentSafetyDtoFromJson(
  Map<String, dynamic> json,
) => SourceContentSafetyDto(
  categories: (json['categories'] as List<dynamic>)
      .map(
        (e) => SourceContentSafetyDtoCategoriesCategories.fromJson(e as String),
      )
      .toList(),
  rawPayloadRetained: json['rawPayloadRetained'] as bool,
  retentionPolicy:
      SourceContentSafetyDtoRetentionPolicyRetentionPolicy.fromJson(
        json['retentionPolicy'] as String,
      ),
  status: SourceContentSafetyDtoStatusStatus.fromJson(json['status'] as String),
);

Map<String, dynamic> _$SourceContentSafetyDtoToJson(
  SourceContentSafetyDto instance,
) => <String, dynamic>{
  'categories': instance.categories,
  'rawPayloadRetained': instance.rawPayloadRetained,
  'retentionPolicy': instance.retentionPolicy,
  'status': instance.status,
};
