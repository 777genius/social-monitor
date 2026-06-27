import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_binding_health_state.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_binding_status.dart';
import 'package:social_monitor_sources/src/infrastructure/api/source_binding_health_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/mappers/source_binding_mapper.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  test('maps source binding config preview into display-safe items', () {
    const mapper = SourceBindingMapper();

    final binding = mapper.toDomain(
      sourceBindingApiDto(
        configPreview: const {
          'mode': 'listing',
          'secret': {'encrypted': true, 'algorithm': 'aes-gcm'},
        },
      ),
    );

    expect(binding.status, SourceBindingStatus.enabled);
    expect(binding.configValue('mode'), 'listing');
    expect(binding.configValue('secret'), 'encrypted');
  });

  test('maps unknown binding and health states as unknown', () {
    const mapper = SourceBindingMapper();

    final health = mapper.healthToDomain(
      SourceBindingHealthApiDto(
        sourceBinding: sourceBindingApiDto(status: 'future'),
        healthState: 'future_health',
        operatorAction: 'Review provider',
        evaluatedAt: DateTime.utc(2026, 6, 23),
      ),
    );

    expect(health.binding.status, SourceBindingStatus.unknown);
    expect(health.healthState, SourceBindingHealthState.unknown);
    expect(health.healthState.isHealthy, isFalse);
  });

  test('maps provider-down health state explicitly', () {
    const mapper = SourceBindingMapper();

    final health = mapper.healthToDomain(
      SourceBindingHealthApiDto(
        sourceBinding: sourceBindingApiDto(),
        healthState: 'down',
        operatorAction: 'pause_or_backoff_provider_until_recovery',
        evaluatedAt: DateTime.utc(2026, 6, 23),
      ),
    );

    expect(health.healthState, SourceBindingHealthState.down);
    expect(health.healthState.isHealthy, isFalse);
  });
}
