// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_next_action_dto_kind_kind.dart';

part 'reader_summary_next_action_dto.g.dart';

@JsonSerializable()
class ReaderSummaryNextActionDto {
  const ReaderSummaryNextActionDto({
    required this.citationIds,
    required this.kind,
    required this.label,
    required this.reason,
    this.canonicalUrl,
  });

  factory ReaderSummaryNextActionDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryNextActionDtoFromJson(json);

  final String? canonicalUrl;
  final List<String> citationIds;
  final ReaderSummaryNextActionDtoKindKind kind;
  final String label;
  final String reason;

  Map<String, Object?> toJson() => _$ReaderSummaryNextActionDtoToJson(this);
}
