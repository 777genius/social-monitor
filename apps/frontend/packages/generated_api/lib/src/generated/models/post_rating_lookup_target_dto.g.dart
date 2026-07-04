// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_rating_lookup_target_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostRatingLookupTargetDto _$PostRatingLookupTargetDtoFromJson(
  Map<String, dynamic> json,
) => PostRatingLookupTargetDto(
  interestId: json['interestId'] as String,
  feedItemId: json['feedItemId'] as String?,
  sourceItemId: json['sourceItemId'] as String?,
);

Map<String, dynamic> _$PostRatingLookupTargetDtoToJson(
  PostRatingLookupTargetDto instance,
) => <String, dynamic>{
  'feedItemId': instance.feedItemId,
  'interestId': instance.interestId,
  'sourceItemId': instance.sourceItemId,
};
