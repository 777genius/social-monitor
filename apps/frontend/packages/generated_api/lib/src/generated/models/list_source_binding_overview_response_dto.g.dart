// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_source_binding_overview_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListSourceBindingOverviewResponseDto
_$ListSourceBindingOverviewResponseDtoFromJson(Map<String, dynamic> json) =>
    ListSourceBindingOverviewResponseDto(
      items: (json['items'] as List<dynamic>)
          .map(
            (e) => SourceBindingHealthResponseDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      nextCursor: json['nextCursor'] as String?,
    );

Map<String, dynamic> _$ListSourceBindingOverviewResponseDtoToJson(
  ListSourceBindingOverviewResponseDto instance,
) => <String, dynamic>{
  'items': instance.items,
  'nextCursor': instance.nextCursor,
};
