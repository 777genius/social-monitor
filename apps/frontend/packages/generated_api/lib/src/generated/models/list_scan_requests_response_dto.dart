// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'scan_status_response_dto.dart';

part 'list_scan_requests_response_dto.g.dart';

@JsonSerializable()
class ListScanRequestsResponseDto {
  const ListScanRequestsResponseDto({
    required this.scanRequests,
    this.nextCursor,
  });

  factory ListScanRequestsResponseDto.fromJson(Map<String, Object?> json) =>
      _$ListScanRequestsResponseDtoFromJson(json);

  final String? nextCursor;
  final List<ScanStatusResponseDto> scanRequests;

  Map<String, Object?> toJson() => _$ListScanRequestsResponseDtoToJson(this);
}
