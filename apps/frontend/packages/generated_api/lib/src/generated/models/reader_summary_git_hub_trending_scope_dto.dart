// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reader_summary_git_hub_trending_scope_dto.g.dart';

@JsonSerializable()
class ReaderSummaryGitHubTrendingScopeDto {
  const ReaderSummaryGitHubTrendingScopeDto({
    this.programmingLanguage,
    this.spokenLanguage,
  });

  factory ReaderSummaryGitHubTrendingScopeDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryGitHubTrendingScopeDtoFromJson(json);

  final String? programmingLanguage;
  final String? spokenLanguage;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryGitHubTrendingScopeDtoToJson(this);
}
