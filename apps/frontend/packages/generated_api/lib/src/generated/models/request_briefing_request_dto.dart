// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_scope_dto.dart';

part 'request_briefing_request_dto.g.dart';

@JsonSerializable()
class RequestBriefingRequestDto {
  const RequestBriefingRequestDto({
    required this.scope,
    this.subscriptionId,
    this.userId,
  });

  factory RequestBriefingRequestDto.fromJson(Map<String, Object?> json) =>
      _$RequestBriefingRequestDtoFromJson(json);

  final BriefingScopeDto scope;
  final String? subscriptionId;
  final String? userId;

  Map<String, Object?> toJson() => _$RequestBriefingRequestDtoToJson(this);
}
