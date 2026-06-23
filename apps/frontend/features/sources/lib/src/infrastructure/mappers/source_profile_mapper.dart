import '../../domain/entities/source_profile.dart';
import '../../domain/value_objects/source_provider_key.dart';
import '../../domain/value_objects/source_readiness_state.dart';
import '../../domain/value_objects/source_runtime_readiness.dart';
import '../api/source_profile_api_dto.dart';

final class SourceProfileMapper {
  const SourceProfileMapper();

  SourceProfile toDomain(SourceProfileApiDto dto) {
    final providerKey = SourceProviderKey(dto.providerKey);
    return SourceProfile(
      providerKey: providerKey,
      displayName: _displayName(dto.displayName, providerKey.normalized),
      productionSafe: dto.productionSafe,
      readinessState: _readinessState(dto.readinessState),
      runtimeReadiness: _runtimeReadiness(dto.runtimeReadiness),
      acquisitionMode: _safeText(dto.acquisitionMode, fallback: 'unknown'),
      supportedQueryModes: _safeList(dto.supportedQueryModes),
      supportedContentUnits: _safeList(dto.supportedContentUnits),
      cursorModel: _safeText(dto.cursorModel, fallback: 'unknown'),
      quotaModel: _safeText(dto.quotaModel, fallback: 'unknown'),
      limitations: _safeList(dto.limitations),
      liveBetaBlockers: _safeList(dto.liveBetaBlockers),
      capabilityVersion: dto.capabilityVersion,
    );
  }

  String _displayName(String? displayName, String providerKey) {
    final trimmed = displayName?.trim();
    if (trimmed != null && trimmed.isNotEmpty) {
      return trimmed;
    }
    if (providerKey.isEmpty) {
      return 'Unknown provider';
    }
    return providerKey
        .split(RegExp(r'[_\-\s]+'))
        .where((part) => part.isNotEmpty)
        .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
        .join(' ');
  }

  SourceReadinessState _readinessState(String value) {
    return switch (value.trim()) {
      'research_only' => SourceReadinessState.researchOnly,
      'profiled' => SourceReadinessState.profiled,
      'certification_ready' => SourceReadinessState.certificationReady,
      'enabled_beta' => SourceReadinessState.enabledBeta,
      'provider_only' => SourceReadinessState.providerOnly,
      'manual_only' => SourceReadinessState.manualOnly,
      'rejected' => SourceReadinessState.rejected,
      _ => SourceReadinessState.unknown,
    };
  }

  SourceRuntimeReadiness _runtimeReadiness(String value) {
    return switch (value.trim()) {
      'fixture_ready' => SourceRuntimeReadiness.fixtureReady,
      'live_beta_ready' => SourceRuntimeReadiness.liveBetaReady,
      'deferred' => SourceRuntimeReadiness.deferred,
      _ => SourceRuntimeReadiness.unknown,
    };
  }

  String _safeText(String value, {required String fallback}) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? fallback : trimmed;
  }

  List<String> _safeList(List<String> values) {
    return values
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .toList(growable: false);
  }
}
