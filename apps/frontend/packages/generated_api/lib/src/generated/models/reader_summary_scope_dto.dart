// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_scope_dto_type_type.dart';

part 'reader_summary_scope_dto.g.dart';

@JsonSerializable()
class ReaderSummaryScopeDto {
  const ReaderSummaryScopeDto({required this.type, this.topicId});

  factory ReaderSummaryScopeDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryScopeDtoFromJson(json);

  final String? topicId;
  final ReaderSummaryScopeDtoTypeType type;

  Map<String, Object?> toJson() => _$ReaderSummaryScopeDtoToJson(this);
}
