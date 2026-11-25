import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_sources/src/domain/value_objects/credential_health.dart';
import 'package:social_monitor_sources/src/infrastructure/mappers/source_summary_mapper.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  test('maps source DTO and redacts credential-flavored health labels', () {
    const mapper = SourceSummaryMapper();

    final source = mapper.toDomain(sourceSummaryApiDto());

    expect(source.id.value, 'rss');
    expect(source.credentialHealth, CredentialHealth.expired);
    expect(source.healthLabel, 'Credential attention required');
  });

  test('maps unknown health and disabled capability safely', () {
    const mapper = SourceSummaryMapper();

    final source = mapper.toDomain(
      sourceSummaryApiDto(
        credentialHealth: 'provider_paused',
        healthLabel: '',
        capabilityEnabled: false,
        capabilityDisabledReasonCode: 'provider_beta_disabled',
      ),
    );

    expect(source.credentialHealth, CredentialHealth.unknown);
    expect(source.healthLabel, 'Unknown health');
    expect(source.capability.isEnabled, isFalse);
    expect(source.capability.key, 'sources.rss');
    expect(source.capability.disabledReasonCode, 'provider_beta_disabled');
  });

  test('falls back when capability key is missing', () {
    const mapper = SourceSummaryMapper();

    final source = mapper.toDomain(sourceSummaryApiDto(capabilityKey: ' '));

    expect(source.capability.key, 'source.unknown');
  });
}
