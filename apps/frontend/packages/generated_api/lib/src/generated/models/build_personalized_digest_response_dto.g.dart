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
  interestIds: (json['interestIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  items: (json['items'] as List<dynamic>)
      .map((e) => RankedFeedItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  status: BuildPersonalizedDigestResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  userId: json['userId'] as String,
  window: PersonalizedDigestWindowDto.fromJson(
    json['window'] as Map<String, dynamic>,
  ),
  memoryGuidance: json['memoryGuidance'] == null
      ? null
      : RelevanceMemoryGuidanceDto.fromJson(
          json['memoryGuidance'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$BuildPersonalizedDigestResponseDtoToJson(
  BuildPersonalizedDigestResponseDto instance,
) => <String, dynamic>{
  'highSignalFeedItemIds': instance.highSignalFeedItemIds,
  'interestIds': instance.interestIds,
  'items': instance.items,
  'memoryGuidance': instance.memoryGuidance,
  'status': instance.status,
  'userId': instance.userId,
  'window': instance.window,
};
