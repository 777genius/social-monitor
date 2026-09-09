// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_headline_binding_dto_availability_availability.dart';

part 'reader_summary_headline_binding_dto.g.dart';

@JsonSerializable()
class ReaderSummaryHeadlineBindingDto {
  const ReaderSummaryHeadlineBindingDto({
    required this.availability,
    required this.candidateId,
    required this.interestId,
    required this.providerKey,
    required this.reviewedInputDigest,
    required this.sourceBindingId,
    required this.sourceItemId,
    required this.tenantId,
    required this.trustedIntent,
    required this.workspaceId,
  });

  factory ReaderSummaryHeadlineBindingDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryHeadlineBindingDtoFromJson(json);

  final ReaderSummaryHeadlineBindingDtoAvailabilityAvailability availability;
  final String candidateId;
  final String interestId;
  final String providerKey;
  final String reviewedInputDigest;
  final String sourceBindingId;
  final String sourceItemId;
  final String tenantId;
  final String trustedIntent;
  final String workspaceId;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryHeadlineBindingDtoToJson(this);
}
