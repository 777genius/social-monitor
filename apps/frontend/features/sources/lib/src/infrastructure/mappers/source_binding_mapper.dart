import '../../domain/entities/source_binding.dart';
import '../../domain/entities/source_binding_health_snapshot.dart';
import '../../domain/value_objects/source_binding_health_state.dart';
import '../../domain/value_objects/source_binding_id.dart';
import '../../domain/value_objects/source_binding_status.dart';
import '../../domain/value_objects/source_interest_id.dart';
import '../../domain/value_objects/source_provider_key.dart';
import '../api/source_binding_api_dto.dart';
import '../api/source_binding_health_api_dto.dart';

final class SourceBindingMapper {
  const SourceBindingMapper();

  SourceBinding toDomain(SourceBindingApiDto dto) {
    return SourceBinding(
      id: SourceBindingId(dto.id),
      interestId: SourceInterestId(dto.interestId),
      providerKey: SourceProviderKey(dto.providerKey),
      capabilityProfileVersion: dto.capabilityProfileVersion,
      status: _status(dto.status),
      configPreview: _previewItems(dto.configPreview),
      createdAt: dto.createdAt,
    );
  }

  SourceBindingHealthSnapshot healthToDomain(SourceBindingHealthApiDto dto) {
    return SourceBindingHealthSnapshot(
      binding: toDomain(dto.sourceBinding),
      healthState: _healthState(dto.healthState),
      operatorAction: _safeText(dto.operatorAction, fallback: 'Review binding'),
      evaluatedAt: dto.evaluatedAt,
      freshness: dto.freshness == null
          ? null
          : SourceBindingFreshness(
              isFresh: dto.freshness!.isFresh,
              ageSeconds: dto.freshness!.ageSeconds,
              staleBySeconds: dto.freshness!.staleBySeconds,
            ),
      latestScan: dto.latestScan == null
          ? null
          : SourceBindingScanSummary(
              scanJobId: dto.latestScan!.scanJobId,
              status: dto.latestScan!.status,
              userState: dto.latestScan!.userState,
              operatorAction: dto.latestScan!.operatorAction,
              failureClass: dto.latestScan!.failureClass,
              failureReason: dto.latestScan!.failureReason,
              fetched: dto.latestScan!.fetched,
              inserted: dto.latestScan!.inserted,
              skippedDuplicates: dto.latestScan!.skippedDuplicates,
              projected: dto.latestScan!.projected,
            ),
    );
  }

  SourceBindingStatus _status(String value) {
    return switch (value.trim()) {
      'enabled' => SourceBindingStatus.enabled,
      'paused' => SourceBindingStatus.paused,
      _ => SourceBindingStatus.unknown,
    };
  }

  SourceBindingHealthState _healthState(String value) {
    return switch (value.trim()) {
      'paused' => SourceBindingHealthState.paused,
      'not_configured' => SourceBindingHealthState.notConfigured,
      'scheduled' => SourceBindingHealthState.scheduled,
      'scanning' => SourceBindingHealthState.scanning,
      'healthy' => SourceBindingHealthState.healthy,
      'stale' => SourceBindingHealthState.stale,
      'degraded' => SourceBindingHealthState.degraded,
      'down' => SourceBindingHealthState.down,
      _ => SourceBindingHealthState.unknown,
    };
  }

  List<SourceBindingConfigPreviewItem> _previewItems(
    Map<String, Object?> preview,
  ) {
    return preview.entries
        .map(
          (entry) => SourceBindingConfigPreviewItem(
            key: entry.key,
            value: _previewValue(entry.value),
          ),
        )
        .toList(growable: false);
  }

  String _previewValue(Object? value) {
    return switch (value) {
      null => 'null',
      String() => value,
      num() || bool() => '$value',
      List<Object?>() => value.map(_previewValue).join(', '),
      Map<Object?, Object?>() when value['encrypted'] == true => 'encrypted',
      Map<Object?, Object?>() =>
        value.entries
            .map((entry) => '${entry.key}: ${_previewValue(entry.value)}')
            .join(', '),
      _ => '$value',
    };
  }

  String _safeText(String value, {required String fallback}) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? fallback : trimmed;
  }
}
