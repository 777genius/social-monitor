import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_sources/src/domain/entities/source_binding_overview.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_binding_health_state.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_binding_status.dart';
import 'package:social_monitor_sources/src/infrastructure/api/source_binding_api_dto.dart';
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
        healthExplanation: const SourceBindingHealthExplanationApiDto(
          reasonCode: 'source_unknown',
          message: 'Review provider.',
          operatorAction: 'Review provider',
          signals: ['unknown'],
        ),
        evaluatedAt: DateTime.utc(2026, 6, 23),
      ),
    );

    expect(health.binding.status, SourceBindingStatus.unknown);
    expect(health.healthState, SourceBindingHealthState.unknown);
    expect(health.healthState.isHealthy, isFalse);
  });

  test('maps explainable rate-limited health state explicitly', () {
    const mapper = SourceBindingMapper();

    final health = mapper.healthToDomain(
      SourceBindingHealthApiDto(
        sourceBinding: sourceBindingApiDto(),
        healthState: 'rate_limited',
        operatorAction: 'wait_for_provider_rate_limit_backoff',
        healthExplanation: const SourceBindingHealthExplanationApiDto(
          reasonCode: 'source_rate_limited',
          message: 'Reddit rate limited until 14:30 UTC.',
          operatorAction: 'wait_for_provider_rate_limit_backoff',
          signals: ['rate_limited'],
        ),
        evaluatedAt: DateTime.utc(2026, 6, 23),
      ),
    );

    expect(health.healthState, SourceBindingHealthState.rateLimited);
    expect(health.healthExplanation.reasonCode, 'source_rate_limited');
    expect(health.healthExplanation.message, contains('rate limited'));
    expect(health.healthState.isHealthy, isFalse);
  });

  test('maps overview degradation reasons by provider', () {
    const mapper = SourceBindingMapper();

    final overview = mapper.overviewToDomain(
      SourceBindingOverviewApiDto(
        summary: SourceBindingOverviewSummaryApiDto(
          totalBindings: 2,
          operatorAction: 'Review provider status',
          degradationReasons: const [
            SourceBindingOverviewDegradationReasonApiDto(
              code: 'rate_limited',
              severity: 'warning',
              affectedBindings: 1,
              operatorAction: 'Wait for provider backoff.',
              sampleSourceBindingIds: ['binding-reddit'],
              signals: ['rate_limited'],
            ),
          ],
          providerBreakdown: const [
            SourceBindingOverviewProviderBreakdownApiDto(
              providerKey: 'reddit',
              totalBindings: 1,
              degradationReasons: [
                SourceBindingOverviewDegradationReasonApiDto(
                  code: 'rate_limited',
                  severity: 'warning',
                  affectedBindings: 1,
                  operatorAction: 'Wait for provider backoff.',
                  sampleSourceBindingIds: ['binding-reddit'],
                  signals: ['rate_limited'],
                ),
              ],
            ),
          ],
        ),
      ),
    );

    expect(overview.hasProviderStatus, isTrue);
    expect(
      overview.summary.providerBreakdown.single.providerKey.value,
      'reddit',
    );
    expect(
      overview.summary.degradationReasons.single.severity,
      SourceBindingOverviewDegradationSeverity.warning,
    );
  });
}
