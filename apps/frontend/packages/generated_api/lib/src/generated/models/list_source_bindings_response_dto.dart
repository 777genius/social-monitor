// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'source_binding_response_dto.dart';

part 'list_source_bindings_response_dto.g.dart';

@JsonSerializable()
class ListSourceBindingsResponseDto {
  const ListSourceBindingsResponseDto({
    required this.sourceBindings,
    this.nextCursor,
  });

  factory ListSourceBindingsResponseDto.fromJson(Map<String, Object?> json) =>
      _$ListSourceBindingsResponseDtoFromJson(json);

  final String? nextCursor;
  final List<SourceBindingResponseDto> sourceBindings;

  Map<String, Object?> toJson() => _$ListSourceBindingsResponseDtoToJson(this);
}
