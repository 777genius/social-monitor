// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'auth_session_response_dto.dart';
import 'reader_summary_bootstrap_response_dto.dart';

part 'app_bootstrap_response_dto.g.dart';

@JsonSerializable()
class AppBootstrapResponseDto {
  const AppBootstrapResponseDto({
    required this.readerSummaries,
    required this.session,
  });

  factory AppBootstrapResponseDto.fromJson(Map<String, Object?> json) =>
      _$AppBootstrapResponseDtoFromJson(json);

  final ReaderSummaryBootstrapResponseDto readerSummaries;
  final AuthSessionResponseDto session;

  Map<String, Object?> toJson() => _$AppBootstrapResponseDtoToJson(this);
}
