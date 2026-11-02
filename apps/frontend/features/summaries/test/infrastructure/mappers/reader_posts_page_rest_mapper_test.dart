import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/reader_posts_page_rest_mapper.dart';
import 'support/reader_post_rest_test_dto.dart';

void main() {
  test(
    'explains missing quote context and preserves unknown reason fallback',
    () {
      final quote = readerPostFromRest(
        readerPostRestTestDto(quotedContext: 'not_captured', likeCount: 1044),
      );
      expect(quote.reason, 'No AI assessment · Quoted post text unavailable');
      expect(quote.providerMetrics.single.label, 'Likes');
      expect(quote.providerMetrics.single.value, '1044');
      expect(quote.promotionAttestation, isNull);
      expect(
        readerPostFromRest(readerPostRestTestDto()).reason,
        'No AI assessment',
      );
      expect(
        readerPostFromRest(
          readerPostRestTestDto(quotedContext: 'future_reason'),
        ).reason,
        'No AI assessment',
      );
    },
  );

  test('names the two judgments instead of showing unexplained tags', () {
    final post = readerPostFromRest(
      readerPostRestTestDto(relevance: 'central', usefulness: 'context'),
    );
    expect(post.reason, 'Topic: Direct match · Usefulness: Background');
  });

  test('explains insufficient information once', () {
    final post = readerPostFromRest(
      readerPostRestTestDto(
        relevance: 'insufficient_context',
        usefulness: 'insufficient_context',
      ),
    );
    expect(post.reason, 'Not enough information to assess');
  });

  test('does not repeat the assessment as the body of a title-only post', () {
    final post = readerPostFromRest(
      readerPostRestTestDto(
        bodyPreview: '',
        relevance: 'insufficient_context',
        usefulness: 'insufficient_context',
      ),
    );
    expect(post.reason, 'Not enough information to assess');
    expect(post.summary, 'Post text unavailable.');
    expect(post.capturedSource?.body, isNull);
  });

  test('never substitutes weighted engagement for unknown native likes', () {
    for (final likes in <num?>[null, -1, 1.5, 9007199254740992]) {
      expect(
        readerPostFromRest(
          readerPostRestTestDto(likeCount: likes),
        ).providerMetrics,
        isEmpty,
      );
    }
    expect(
      readerPostFromRest(
        readerPostRestTestDto(likeCount: 0),
      ).providerMetrics.single.value,
      '0',
    );
  });
}
