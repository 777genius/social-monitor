import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';

ReaderPostDto readerPostRestTestDto({
  num? likeCount,
  String? relevance,
  String? usefulness,
  String? quotedContext,
}) => ReaderPostDto.fromJson({
  'id': 'post',
  'sourceItemId': 'source',
  'providerKey': 'x-twitter',
  'providerFamily': 'x',
  'title': 'A comment on a quoted post',
  'bodyPreview': 'The collected comment',
  'canonicalUrl': 'https://example.test/post',
  'publishedAt': '2026-10-31T10:00:00Z',
  'engagement': 1250,
  'likeCount': likeCount,
  'engagementObservedAt': '2026-10-31T18:00:00Z',
  'usefulness': usefulness,
  'relevance': relevance,
  'quotedContext': quotedContext,
});
