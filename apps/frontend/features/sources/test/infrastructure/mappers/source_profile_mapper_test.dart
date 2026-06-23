import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_readiness_state.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_runtime_readiness.dart';
import 'package:social_monitor_sources/src/infrastructure/mappers/source_profile_mapper.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  test('maps ready source profile into domain language', () {
    const mapper = SourceProfileMapper();

    final profile = mapper.toDomain(sourceProfileApiDto());

    expect(profile.providerKey.value, 'reddit');
    expect(profile.displayName, 'Reddit');
    expect(profile.readinessState, SourceReadinessState.enabledBeta);
    expect(profile.runtimeReadiness, SourceRuntimeReadiness.liveBetaReady);
    expect(profile.isReady, isTrue);
  });

  test('maps unknown readiness and runtime as degraded not healthy', () {
    const mapper = SourceProfileMapper();

    final profile = mapper.toDomain(
      sourceProfileApiDto(
        providerKey: 'new_provider',
        displayName: null,
        readinessState: 'future_state',
        runtimeReadiness: 'future_runtime',
        limitations: const ['Future backend state'],
      ),
    );

    expect(profile.displayName, 'New Provider');
    expect(profile.readinessState, SourceReadinessState.unknown);
    expect(profile.runtimeReadiness, SourceRuntimeReadiness.unknown);
    expect(profile.isReady, isFalse);
    expect(profile.isDegraded, isTrue);
  });
}
