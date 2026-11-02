import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/reader_posts_page_rest_mapper.dart';

void main() {
  test(
    'explains missing quote context and preserves unknown reason fallback',
    () {
      ReaderPostDto dto(String? reason) => ReaderPostDto.fromJson({
        'id': 'post',
        'sourceItemId': 'source',
        'providerKey': 'x-twitter',
        'providerFamily': 'x',
        'title': 'A comment on a quoted post',
        'bodyPreview': 'The collected comment',
        'canonicalUrl': 'https://example.test/post',
        'publishedAt': '2026-10-31T10:00:00Z',
        'engagement': 104,
        'engagementObservedAt': '2026-10-31T18:00:00Z',
        'usefulness': null,
        'relevance': null,
        'quotedContext': reason,
      });
      final quote = readerPostFromRest(dto('not_captured'));
      expect(quote.reason, 'Not assessed · Quoted context was not captured');
      expect(quote.providerMetrics.single.value, '104');
      expect(quote.promotionAttestation, isNull);
      expect(readerPostFromRest(dto(null)).reason, 'Not assessed');
      expect(readerPostFromRest(dto('future_reason')).reason, 'Not assessed');
    },
  );
}
