import '../../domain/entities/source_summary.dart';
import '../../domain/value_objects/credential_health.dart';
import '../../domain/value_objects/provider_capability.dart';
import '../../domain/value_objects/source_collection_status.dart';
import '../../domain/value_objects/source_id.dart';
import '../api/source_summary_api_dto.dart';

final class SourceSummaryMapper {
  const SourceSummaryMapper();

  SourceSummary toDomain(SourceSummaryApiDto dto) {
    return SourceSummary(
      id: SourceId(_nonEmpty(dto.id, fallback: 'source-unknown')),
      name: _nonEmpty(dto.name, fallback: 'Unknown source'),
      credentialHealth: _healthFromApi(dto.credentialHealth),
      healthLabel: _safeHealthLabel(dto.healthLabel),
      capability: ProviderCapability(
        key: _nonEmpty(dto.capabilityKey, fallback: 'source.unknown'),
        isEnabled: dto.capabilityEnabled,
        disabledReasonCode: dto.capabilityDisabledReasonCode,
      ),
      collectionStatus: _statusFromApi(dto.collectionStatus),
    );
  }

  CredentialHealth _healthFromApi(String value) {
    return switch (value.trim().toLowerCase()) {
      'healthy' => CredentialHealth.healthy,
      'expired' => CredentialHealth.expired,
      'disconnected' => CredentialHealth.disconnected,
      _ => CredentialHealth.unknown,
    };
  }

  SourceCollectionStatus _statusFromApi(String value) {
    return switch (value.trim().toLowerCase()) {
      'collecting' => SourceCollectionStatus.collecting,
      'paused' => SourceCollectionStatus.paused,
      _ => SourceCollectionStatus.unknown,
    };
  }

  String _safeHealthLabel(String value) {
    if (value.toLowerCase().contains('token')) {
      return 'Credential attention required';
    }
    return _nonEmpty(value, fallback: 'Unknown health');
  }

  String _nonEmpty(String? value, {required String fallback}) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return fallback;
    }
    return trimmed;
  }
}
