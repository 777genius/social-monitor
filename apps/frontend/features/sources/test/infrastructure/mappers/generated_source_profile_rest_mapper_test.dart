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
            readinessState: generated
                .SourceProfileDtoReadinessStateReadinessState
                .enabledBeta,
            runtimeReadiness: generated
                .SourceProfileDtoRuntimeReadinessRuntimeReadiness
                .liveBetaReady,
            acquisitionMode: 'pull',
            supportedQueryModes: ['keyword', 'boolean'],
            supportedContentUnits: ['posts', 'comments'],
            cursorModel: 'time-based',
            quotaModel: 'rate limit',
            limitations: ['Rate limits vary by endpoint'],
            liveBetaBlockers: [],
            capabilityVersion: 1,
          ),
        ],
      ),
    );

    expect(response.items.single.providerKey, 'reddit');
    expect(response.items.single.readinessState, 'enabled_beta');
    expect(response.items.single.runtimeReadiness, 'live_beta_ready');
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
              readinessState: generated
                  .SourceProfileDtoReadinessStateReadinessState
                  .$unknown,
              runtimeReadiness: generated
                  .SourceProfileDtoRuntimeReadinessRuntimeReadiness
                  .$unknown,
              acquisitionMode: 'pull',
              supportedQueryModes: [],
              supportedContentUnits: [],
              cursorModel: 'unknown',
              quotaModel: 'unknown',
              limitations: [],
              liveBetaBlockers: [],
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
