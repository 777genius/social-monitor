import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_sources/src/infrastructure/api/source_health_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/mappers/source_health_mapper.dart';

void main() {
  test('maps latest health summary without provider payload leakage', () {
    const mapper = SourceHealthMapper();

    final health = mapper.toDomain(
      const SourceHealthApiDto(
        sourceId: 'rss',
        summary: 'OAuth token failed in raw provider payload',
        checkedAtLabel: 'Just now',
        issueCount: 3,
        providerPayloadPreview: 'never-render-this',
      ),
    );

    expect(health.sourceId.value, 'rss');
    expect(health.summary, 'Credential details are hidden');
    expect(health.issueCount, 3);
  });
}
