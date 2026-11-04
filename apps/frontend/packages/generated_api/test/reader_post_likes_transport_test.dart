import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:test/test.dart';

void main() {
  const base = <String, Object?>{
    'id': 'synthetic-post',
    'sourceItemId': 'synthetic-source',
    'providerKey': 'x-twitter',
    'providerFamily': 'x',
    'title': 'Synthetic source',
    'bodyPreview': 'Synthetic excerpt',
    'canonicalUrl': 'https://example.test/post',
    'publishedAt': '2026-11-01T12:00:00Z',
    'engagement': 205,
    'engagementObservedAt': null,
    'usefulness': null,
    'relevance': null,
  };

  group('raw X like count transport', () {
    test('preserves likes separately from weighted Model engagement', () {
      final post = ReaderPostDto.fromJson({...base, 'likeCount': 5});
      expect(post.likeCount, 5);
      expect(post.engagement, 205);
      expect(post.toJson()['likeCount'], 5);
    });

    test('keeps a genuine zero distinct from unknown or absent likes', () {
      expect(ReaderPostDto.fromJson({...base, 'likeCount': 0}).likeCount, 0);
      expect(
        ReaderPostDto.fromJson({...base, 'likeCount': null}).likeCount,
        isNull,
      );
      expect(ReaderPostDto.fromJson(base).likeCount, isNull);
    });
  });
}
