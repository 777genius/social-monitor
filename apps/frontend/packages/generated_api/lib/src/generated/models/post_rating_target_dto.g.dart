// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_rating_target_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostRatingTargetDto _$PostRatingTargetDtoFromJson(Map<String, dynamic> json) =>
    PostRatingTargetDto(
      interestId: json['interestId'] as String,
      feedItemId: json['feedItemId'] as String?,
      sourceItemId: json['sourceItemId'] as String?,
    );

Map<String, dynamic> _$PostRatingTargetDtoToJson(
  PostRatingTargetDto instance,
) => <String, dynamic>{
  'feedItemId': instance.feedItemId,
  'interestId': instance.interestId,
  'sourceItemId': instance.sourceItemId,
};
