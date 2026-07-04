// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'record_post_rating_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RecordPostRatingResponseDto _$RecordPostRatingResponseDtoFromJson(
  Map<String, dynamic> json,
) => RecordPostRatingResponseDto(
  created: json['created'] as bool,
  learningDirection:
      RecordPostRatingResponseDtoLearningDirectionLearningDirection.fromJson(
        json['learningDirection'] as String,
      ),
  rating: PostRatingDto.fromJson(json['rating'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RecordPostRatingResponseDtoToJson(
  RecordPostRatingResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'learningDirection': instance.learningDirection,
  'rating': instance.rating,
};
