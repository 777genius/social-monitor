// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'relevance_feedback_target_dto.g.dart';

@JsonSerializable()
class RelevanceFeedbackTargetDto {
  const RelevanceFeedbackTargetDto({
    required this.providerKey,
    required this.topicId,
    this.feedItemId,
  });

  factory RelevanceFeedbackTargetDto.fromJson(Map<String, Object?> json) =>
      _$RelevanceFeedbackTargetDtoFromJson(json);

  final String? feedItemId;
  final String providerKey;
  final String topicId;

  Map<String, Object?> toJson() => _$RelevanceFeedbackTargetDtoToJson(this);
}
