import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_sources/src/domain/value_objects/source_readiness_state.dart';
import 'package:social_monitor_sources/src/infrastructure/mappers/generated_source_profile_rest_mapper.dart';
import 'package:social_monitor_sources/src/infrastructure/mappers/source_profile_mapper.dart';

void main() {
  test('maps generated source profile response into feature DTOs', () {
    const mapper = GeneratedSourceProfileRestMapper();

    final response = mapper.listSourceProfiles(
      const generated.ListSourceProfilesResponseDto(
        sources: [
          generated.SourceProfileDto(
            providerKey: 'reddit',
            displayName: 'Reddit',
            productionSafe: true,
            health: generated.SourceProfileHealthDto(
              state: generated.SourceProfileHealthDtoStateState.healthy,
              reasonCode: 'source_ready',
              message: 'Reddit source ready.',
              signals: ['source_ready'],
            ),
            readinessState: generated
                .SourceProfileDtoReadinessStateReadinessState
                .enabledBeta,
            runtimeReadiness: generated
                .SourceProfileDtoRuntimeReadinessRuntimeReadiness
                .liveBetaReady,
            acquisitionMode: 'pull',
            supportedQueryModes: ['keyword', 'boolean'],
            supportedContentUnits: ['posts', 'comments'],
            unsupportedContentUnits: ['profile', 'media'],
            cursorModel: 'time-based',
            quotaModel: 'rate limit',
            limitations: ['Rate limits vary by endpoint'],
            liveBetaBlockers: [],
            liveEvidenceRequirements: [],
            capabilityVersion: 1,
          ),
        ],
      ),
    );

    expect(response.items.single.providerKey, 'reddit');
    expect(response.items.single.readinessState, 'enabled_beta');
    expect(response.items.single.runtimeReadiness, 'live_beta_ready');
    expect(response.items.single.health.message, 'Reddit source ready.');
    expect(response.items.single.unsupportedContentUnits, ['profile', 'media']);
  });

  test(
    'keeps generated unknown enum values degraded through domain mapper',
    () {
      const restMapper = GeneratedSourceProfileRestMapper();
      const domainMapper = SourceProfileMapper();

      final response = restMapper.listSourceProfiles(
        const generated.ListSourceProfilesResponseDto(
          sources: [
            generated.SourceProfileDto(
              providerKey: 'future',
              productionSafe: true,
              health: generated.SourceProfileHealthDto(
                state: generated.SourceProfileHealthDtoStateState.$unknown,
                reasonCode: '',
                message: '',
                signals: [],
              ),
              readinessState: generated
                  .SourceProfileDtoReadinessStateReadinessState
                  .$unknown,
              runtimeReadiness: generated
                  .SourceProfileDtoRuntimeReadinessRuntimeReadiness
                  .$unknown,
              acquisitionMode: 'pull',
              supportedQueryModes: [],
              supportedContentUnits: [],
              unsupportedContentUnits: [],
              cursorModel: 'unknown',
              quotaModel: 'unknown',
              limitations: [],
              liveBetaBlockers: [],
              liveEvidenceRequirements: [],
            ),
          ],
        ),
      );

      final profile = domainMapper.toDomain(response.items.single);

      expect(profile.readinessState, SourceReadinessState.unknown);
      expect(profile.isReady, isFalse);
    },
  );
}
