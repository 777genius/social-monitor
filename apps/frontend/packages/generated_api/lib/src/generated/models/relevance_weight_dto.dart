// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'relevance_weight_dto.g.dart';

@JsonSerializable()
class RelevanceWeightDto {
  const RelevanceWeightDto({required this.key, required this.weight});

  factory RelevanceWeightDto.fromJson(Map<String, Object?> json) =>
      _$RelevanceWeightDtoFromJson(json);

  final String key;
  final num weight;

  Map<String, Object?> toJson() => _$RelevanceWeightDtoToJson(this);
}
