// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_bootstrap_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AppBootstrapResponseDto _$AppBootstrapResponseDtoFromJson(
  Map<String, dynamic> json,
) => AppBootstrapResponseDto(
  readerSummaries: ReaderSummaryBootstrapResponseDto.fromJson(
    json['readerSummaries'] as Map<String, dynamic>,
  ),
  session: AuthSessionResponseDto.fromJson(
    json['session'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$AppBootstrapResponseDtoToJson(
  AppBootstrapResponseDto instance,
) => <String, dynamic>{
  'readerSummaries': instance.readerSummaries,
  'session': instance.session,
};
