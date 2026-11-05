// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum ReaderSummaryPromotionEngagementDtoMethodMethod {
  @JsonValue('likes_plus_two_reposts')
  likesPlusTwoReposts('likes_plus_two_reposts'),
  @JsonValue('reddit_score')
  redditScore('reddit_score'),
  @JsonValue('hacker_news_points')
  hackerNewsPoints('hacker_news_points'),
  @JsonValue('max_stars_or_half_forks')
  maxStarsOrHalfForks('max_stars_or_half_forks'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const ReaderSummaryPromotionEngagementDtoMethodMethod(this.json);

  factory ReaderSummaryPromotionEngagementDtoMethodMethod.fromJson(
    String json,
  ) => values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;

  String toJson() => json ?? 'null';

  @override
  String toString() => json ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<ReaderSummaryPromotionEngagementDtoMethodMethod>
  get $valuesDefined => values.where((value) => value != $unknown).toList();
}
