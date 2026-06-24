// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_reader_quality_state_dto_flags_flags.dart';
import 'briefing_reader_quality_state_dto_status_status.dart';

part 'briefing_reader_quality_state_dto.g.dart';

@JsonSerializable()
class BriefingReaderQualityStateDto {
  const BriefingReaderQualityStateDto({
    required this.flags,
    required this.isSingleSource,
    required this.status,
    required this.warnings,
  });

  factory BriefingReaderQualityStateDto.fromJson(Map<String, Object?> json) =>
      _$BriefingReaderQualityStateDtoFromJson(json);

  final List<BriefingReaderQualityStateDtoFlagsFlags> flags;
  final bool isSingleSource;
  final BriefingReaderQualityStateDtoStatusStatus status;
  final List<String> warnings;

  Map<String, Object?> toJson() => _$BriefingReaderQualityStateDtoToJson(this);
}
