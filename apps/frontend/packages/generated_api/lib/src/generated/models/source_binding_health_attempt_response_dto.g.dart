// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_binding_health_attempt_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceBindingHealthAttemptResponseDto
_$SourceBindingHealthAttemptResponseDtoFromJson(Map<String, dynamic> json) =>
    SourceBindingHealthAttemptResponseDto(
      fetched: json['fetched'] as num,
      inserted: json['inserted'] as num,
      projected: json['projected'] as num,
      skippedDuplicates: json['skippedDuplicates'] as num,
      sourceBindingId: json['sourceBindingId'] as String,
      startedAt: DateTime.parse(json['startedAt'] as String),
      status: SourceBindingHealthAttemptResponseDtoStatusStatus.fromJson(
        json['status'] as String,
      ),
      failureReason: json['failureReason'] as String?,
      finishedAt: json['finishedAt'] == null
          ? null
          : DateTime.parse(json['finishedAt'] as String),
    );

Map<String, dynamic> _$SourceBindingHealthAttemptResponseDtoToJson(
  SourceBindingHealthAttemptResponseDto instance,
) => <String, dynamic>{
  'failureReason': instance.failureReason,
  'fetched': instance.fetched,
  'finishedAt': instance.finishedAt?.toIso8601String(),
  'inserted': instance.inserted,
  'projected': instance.projected,
  'skippedDuplicates': instance.skippedDuplicates,
  'sourceBindingId': instance.sourceBindingId,
  'startedAt': instance.startedAt.toIso8601String(),
  'status': instance.status,
};
