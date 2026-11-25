// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_scan_requests_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListScanRequestsResponseDto _$ListScanRequestsResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListScanRequestsResponseDto(
  scanRequests: (json['scanRequests'] as List<dynamic>)
      .map((e) => ScanStatusResponseDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  nextCursor: json['nextCursor'] as String?,
);

Map<String, dynamic> _$ListScanRequestsResponseDtoToJson(
  ListScanRequestsResponseDto instance,
) => <String, dynamic>{
  'nextCursor': instance.nextCursor,
  'scanRequests': instance.scanRequests,
};
