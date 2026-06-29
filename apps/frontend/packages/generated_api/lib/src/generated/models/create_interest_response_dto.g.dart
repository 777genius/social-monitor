// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_interest_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateInterestResponseDto _$CreateInterestResponseDtoFromJson(
  Map<String, dynamic> json,
) => CreateInterestResponseDto(
  created: json['created'] as bool,
  interestId: json['interestId'] as String,
);

Map<String, dynamic> _$CreateInterestResponseDtoToJson(
  CreateInterestResponseDto instance,
) => <String, dynamic>{
  'created': instance.created,
  'interestId': instance.interestId,
};
