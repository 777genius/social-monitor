// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_git_hub_trending_ranking_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryGitHubTrendingRankingDto
_$ReaderSummaryGitHubTrendingRankingDtoFromJson(Map<String, dynamic> json) =>
    ReaderSummaryGitHubTrendingRankingDto(
      capturedAt: DateTime.parse(json['capturedAt'] as String),
      kind: ReaderSummaryGitHubTrendingRankingDtoKindKind.fromJson(
        json['kind'] as String,
      ),
      position: json['position'] as num,
      scope: ReaderSummaryGitHubTrendingScopeDto.fromJson(
        json['scope'] as Map<String, dynamic>,
      ),
      starsGained: json['starsGained'] as num,
      window: ReaderSummaryGitHubTrendingRankingDtoWindowWindow.fromJson(
        json['window'] as String,
      ),
    );

Map<String, dynamic> _$ReaderSummaryGitHubTrendingRankingDtoToJson(
  ReaderSummaryGitHubTrendingRankingDto instance,
) => <String, dynamic>{
  'capturedAt': instance.capturedAt.toIso8601String(),
  'kind': instance.kind,
  'position': instance.position,
  'scope': instance.scope,
  'starsGained': instance.starsGained,
  'window': instance.window,
};
