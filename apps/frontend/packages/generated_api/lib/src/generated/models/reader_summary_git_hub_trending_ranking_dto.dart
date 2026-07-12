// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_git_hub_trending_ranking_dto_kind_kind.dart';
import 'reader_summary_git_hub_trending_ranking_dto_window_window.dart';
import 'reader_summary_git_hub_trending_scope_dto.dart';

part 'reader_summary_git_hub_trending_ranking_dto.g.dart';

@JsonSerializable()
class ReaderSummaryGitHubTrendingRankingDto {
  const ReaderSummaryGitHubTrendingRankingDto({
    required this.capturedAt,
    required this.kind,
    required this.position,
    required this.scope,
    required this.starsGained,
    required this.window,
  });

  factory ReaderSummaryGitHubTrendingRankingDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryGitHubTrendingRankingDtoFromJson(json);

  final DateTime capturedAt;
  final ReaderSummaryGitHubTrendingRankingDtoKindKind kind;
  final num position;
  final ReaderSummaryGitHubTrendingScopeDto scope;
  final num starsGained;
  final ReaderSummaryGitHubTrendingRankingDtoWindowWindow window;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryGitHubTrendingRankingDtoToJson(this);
}
