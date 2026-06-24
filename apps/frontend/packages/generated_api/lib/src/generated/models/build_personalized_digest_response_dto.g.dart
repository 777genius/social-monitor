// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'build_personalized_digest_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BuildPersonalizedDigestResponseDto _$BuildPersonalizedDigestResponseDtoFromJson(
  Map<String, dynamic> json,
) => BuildPersonalizedDigestResponseDto(
  highSignalFeedItemIds: (json['highSignalFeedItemIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  items: (json['items'] as List<dynamic>)
      .map((e) => RankedFeedItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  status: BuildPersonalizedDigestResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  topicIds: (json['topicIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  userId: json['userId'] as String,
  window: PersonalizedDigestWindowDto.fromJson(
    json['window'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$BuildPersonalizedDigestResponseDtoToJson(
  BuildPersonalizedDigestResponseDto instance,
) => <String, dynamic>{
  'highSignalFeedItemIds': instance.highSignalFeedItemIds,
  'items': instance.items,
  'status': instance.status,
  'topicIds': instance.topicIds,
  'userId': instance.userId,
  'window': instance.window,
};
