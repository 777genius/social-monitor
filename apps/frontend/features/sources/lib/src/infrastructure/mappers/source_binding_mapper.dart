import '../../domain/entities/source_binding.dart';
import '../../domain/entities/source_binding_health_snapshot.dart';
import '../../domain/entities/source_binding_overview.dart';
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
      healthExplanation: SourceBindingHealthExplanation(
        reasonCode: _safeText(
          dto.healthExplanation.reasonCode,
          fallback: 'source_unknown',
        ),
        message: _safeText(
          dto.healthExplanation.message,
          fallback: 'Source health explanation unavailable',
        ),
        operatorAction: _safeText(
          dto.healthExplanation.operatorAction,
          fallback: dto.operatorAction,
        ),
        signals: _safeStringList(dto.healthExplanation.signals),
        unavailableUntil: dto.healthExplanation.unavailableUntil,
        staleBySeconds: dto.healthExplanation.staleBySeconds,
      ),
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

  SourceBindingOverview overviewToDomain(SourceBindingOverviewApiDto dto) {
    return SourceBindingOverview(
      summary: SourceBindingOverviewSummary(
        totalBindings: dto.summary.totalBindings,
        operatorAction: _safeText(
          dto.summary.operatorAction,
          fallback: 'Review provider status',
        ),
        degradationReasons: dto.summary.degradationReasons
            .map(_overviewReason)
            .toList(growable: false),
        providerBreakdown: dto.summary.providerBreakdown
            .map(_providerBreakdown)
            .toList(growable: false),
        nextEligibleAt: dto.summary.nextEligibleAt,
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
      'rate_limited' => SourceBindingHealthState.rateLimited,
      'auth_failed' => SourceBindingHealthState.authFailed,
      'degraded' => SourceBindingHealthState.degraded,
      'unsupported_scope' => SourceBindingHealthState.unsupportedScope,
      'down' => SourceBindingHealthState.down,
      _ => SourceBindingHealthState.unknown,
    };
  }

  SourceBindingOverviewProviderBreakdown _providerBreakdown(
    SourceBindingOverviewProviderBreakdownApiDto dto,
  ) {
    return SourceBindingOverviewProviderBreakdown(
      providerKey: SourceProviderKey(dto.providerKey),
      totalBindings: dto.totalBindings,
      degradationReasons: dto.degradationReasons
          .map(_overviewReason)
          .toList(growable: false),
      nextEligibleAt: dto.nextEligibleAt,
    );
  }

  SourceBindingOverviewDegradationReason _overviewReason(
    SourceBindingOverviewDegradationReasonApiDto dto,
  ) {
    return SourceBindingOverviewDegradationReason(
      code: _safeText(dto.code, fallback: 'unknown'),
      severity: _overviewSeverity(dto.severity),
      affectedBindings: dto.affectedBindings,
      operatorAction: _safeText(dto.operatorAction, fallback: 'Review source'),
      sampleSourceBindingIds: _safeStringList(dto.sampleSourceBindingIds),
      signals: _safeStringList(dto.signals),
      nextEligibleAt: dto.nextEligibleAt,
    );
  }

  SourceBindingOverviewDegradationSeverity _overviewSeverity(String value) {
    return switch (value.trim()) {
      'info' => SourceBindingOverviewDegradationSeverity.info,
      'warning' => SourceBindingOverviewDegradationSeverity.warning,
      'critical' => SourceBindingOverviewDegradationSeverity.critical,
      _ => SourceBindingOverviewDegradationSeverity.unknown,
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

  List<String> _safeStringList(List<String> values) {
    return values
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .toList(growable: false);
  }
}
