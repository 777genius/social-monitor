import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_lifecycle_status.dart';
import 'package:social_monitor_interests/src/infrastructure/mappers/interest_summary_mapper.dart';

import '../../support/interests_test_fixtures.dart';

void main() {
  test('maps interest summary DTO into domain language', () {
    const mapper = InterestSummaryMapper();

    final interest = mapper.toDomain(interestSummaryApiDto());

    expect(interest.id.value, 'interest-market-risk');
    expect(interest.name.value, 'Market risk');
    expect(interest.query.value, 'market risk OR volatility');
    expect(interest.status, InterestLifecycleStatus.active);
    expect(interest.weeklyMentionCount, 24);
  });

  test('maps unknown status and missing optional values safely', () {
    const mapper = InterestSummaryMapper();

    final interest = mapper.toDomain(
      interestSummaryApiDto(
        id: '  ',
        name: null,
        query: null,
        status: 'paused_by_provider',
        weeklyMentionCount: null,
      ),
    );

    expect(interest.id.value, 'interest-unknown');
    expect(interest.name.value, 'Untitled interest');
    expect(interest.query.value, 'No query available');
    expect(interest.status, InterestLifecycleStatus.unknown);
    expect(interest.weeklyMentionCount, 0);
  });
}
