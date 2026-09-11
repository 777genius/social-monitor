// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_headline_binding_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryHeadlineBindingDto _$ReaderSummaryHeadlineBindingDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryHeadlineBindingDto(
  availability:
      ReaderSummaryHeadlineBindingDtoAvailabilityAvailability.fromJson(
        json['availability'] as String,
      ),
  candidateId: json['candidateId'] as String,
  interestId: json['interestId'] as String,
  providerKey: json['providerKey'] as String,
  reviewedInputDigest: json['reviewedInputDigest'] as String,
  sourceBindingId: json['sourceBindingId'] as String,
  sourceItemId: json['sourceItemId'] as String,
  tenantId: json['tenantId'] as String,
  trustedIntent: json['trustedIntent'] as String,
  workspaceId: json['workspaceId'] as String,
);

Map<String, dynamic> _$ReaderSummaryHeadlineBindingDtoToJson(
  ReaderSummaryHeadlineBindingDto instance,
) => <String, dynamic>{
  'availability': instance.availability,
  'candidateId': instance.candidateId,
  'interestId': instance.interestId,
  'providerKey': instance.providerKey,
  'reviewedInputDigest': instance.reviewedInputDigest,
  'sourceBindingId': instance.sourceBindingId,
  'sourceItemId': instance.sourceItemId,
  'tenantId': instance.tenantId,
  'trustedIntent': instance.trustedIntent,
  'workspaceId': instance.workspaceId,
};
