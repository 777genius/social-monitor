// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_source_bindings_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListSourceBindingsResponseDto _$ListSourceBindingsResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListSourceBindingsResponseDto(
  sourceBindings: (json['sourceBindings'] as List<dynamic>)
      .map((e) => SourceBindingResponseDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  nextCursor: json['nextCursor'] as String?,
);

Map<String, dynamic> _$ListSourceBindingsResponseDtoToJson(
  ListSourceBindingsResponseDto instance,
) => <String, dynamic>{
  'nextCursor': instance.nextCursor,
  'sourceBindings': instance.sourceBindings,
};
