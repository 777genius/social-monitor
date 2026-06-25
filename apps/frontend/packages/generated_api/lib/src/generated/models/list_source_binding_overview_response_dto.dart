// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_health_response_dto.dart';

part 'list_source_binding_overview_response_dto.g.dart';

@JsonSerializable()
class ListSourceBindingOverviewResponseDto {
  const ListSourceBindingOverviewResponseDto({
    required this.items,
    this.nextCursor,
  });

  factory ListSourceBindingOverviewResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ListSourceBindingOverviewResponseDtoFromJson(json);

  final List<SourceBindingHealthResponseDto> items;
  final String? nextCursor;

  Map<String, Object?> toJson() =>
      _$ListSourceBindingOverviewResponseDtoToJson(this);
}
