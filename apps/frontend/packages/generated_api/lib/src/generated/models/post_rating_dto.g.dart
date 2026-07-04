// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_rating_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostRatingDto _$PostRatingDtoFromJson(Map<String, dynamic> json) =>
    PostRatingDto(
      feedbackId: json['feedbackId'] as String,
      learningEffect: PostRatingDtoLearningEffectLearningEffect.fromJson(
        json['learningEffect'] as String,
      ),
      ratedAt: DateTime.parse(json['ratedAt'] as String),
      rating: json['rating'] as num,
      target: PostRatingTargetDto.fromJson(
        json['target'] as Map<String, dynamic>,
      ),
      userId: json['userId'] as String,
      reason: json['reason'] == null
          ? null
          : PostRatingDtoReasonReason.fromJson(json['reason'] as String),
    );

Map<String, dynamic> _$PostRatingDtoToJson(PostRatingDto instance) =>
    <String, dynamic>{
      'feedbackId': instance.feedbackId,
      'learningEffect': instance.learningEffect,
      'ratedAt': instance.ratedAt.toIso8601String(),
      'rating': instance.rating,
      'reason': instance.reason,
      'target': instance.target,
      'userId': instance.userId,
    };
