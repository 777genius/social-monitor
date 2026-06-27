import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_sources/src/infrastructure/mappers/generated_source_binding_rest_mapper.dart';

void main() {
  test('maps generated source binding list and health DTOs', () {
    const mapper = GeneratedSourceBindingRestMapper();
    final createdAt = DateTime.utc(2026, 6, 23, 12);
    final binding = generated.SourceBindingResponseDto(
      id: 'binding-reddit',
      tenantId: 'tenant-demo',
      workspaceId: 'workspace-demo',
      topicId: 'topic-competitor',
      providerKey: 'reddit',
      capabilityProfileVersion: 1,
      status: generated.SourceBindingResponseDtoStatusStatus.enabled,
      configPreview: const {
        'mode': 'listing',
        'subreddit': 'startups',
        'listing': 'new',
      },
      createdAt: createdAt,
    );

    final list = mapper.listSourceBindings(
      generated.ListSourceBindingsResponseDto(
        sourceBindings: [binding],
        nextCursor: 'cursor-2',
      ),
    );
    final health = mapper.health(
      generated.SourceBindingHealthResponseDto(
        sourceBinding: binding,
        healthState: generated
            .SourceBindingHealthResponseDtoHealthStateHealthState
            .healthy,
        operatorAction: 'No action needed.',
        evaluatedAt: DateTime.utc(2026, 6, 23, 12, 5),
        schedulerDecision:
            const generated.SourceBindingHealthSchedulerDecisionResponseDto(
              canScanNow: true,
              decision: generated
                  .SourceBindingHealthSchedulerDecisionResponseDtoDecisionDecision
                  .ready,
              minimumIntervalSeconds: 300,
              reason: 'Ready for scan.',
              signals: ['freshness_due'],
            ),
        freshness: const generated.SourceBindingHealthFreshnessResponseDto(
          isFresh: true,
          ageSeconds: 120,
        ),
      ),
    );

    expect(list.nextCursor, 'cursor-2');
    expect(list.items.single.configPreview['subreddit'], 'startups');
    expect(health.healthState, 'healthy');
    expect(health.freshness?.ageSeconds, 120);
  });

  test('maps generated provider-down health state', () {
    const mapper = GeneratedSourceBindingRestMapper();
    final binding = generated.SourceBindingResponseDto(
      id: 'binding-reddit',
      tenantId: 'tenant-demo',
      workspaceId: 'workspace-demo',
      topicId: 'topic-competitor',
      providerKey: 'reddit',
      capabilityProfileVersion: 1,
      status: generated.SourceBindingResponseDtoStatusStatus.enabled,
      configPreview: const {'mode': 'listing', 'subreddit': 'OpenAI'},
      createdAt: DateTime.utc(2026, 6, 23, 12),
    );

    final health = mapper.health(
      generated.SourceBindingHealthResponseDto(
        sourceBinding: binding,
        healthState:
            generated.SourceBindingHealthResponseDtoHealthStateHealthState.down,
        operatorAction: 'pause_or_backoff_provider_until_recovery',
        evaluatedAt: DateTime.utc(2026, 6, 23, 12, 5),
        schedulerDecision:
            const generated.SourceBindingHealthSchedulerDecisionResponseDto(
              canScanNow: false,
              decision: generated
                  .SourceBindingHealthSchedulerDecisionResponseDtoDecisionDecision
                  .providerFailureBackoff,
              minimumIntervalSeconds: 900,
              reason: 'provider_failure_backoff_active',
              signals: ['provider_failure_backoff'],
            ),
      ),
    );

    expect(health.healthState, 'down');
    expect(health.operatorAction, 'pause_or_backoff_provider_until_recovery');
  });
}
