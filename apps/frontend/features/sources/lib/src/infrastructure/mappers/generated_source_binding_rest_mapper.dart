import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/source_binding_api_dto.dart';
import '../api/source_binding_health_api_dto.dart';

final class GeneratedSourceBindingRestMapper {
  const GeneratedSourceBindingRestMapper();

  ListSourceBindingsApiResponseDto listSourceBindings(
    generated.ListSourceBindingsResponseDto dto,
  ) {
    return ListSourceBindingsApiResponseDto(
      items: dto.sourceBindings.map(sourceBinding).toList(growable: false),
      nextCursor: dto.nextCursor,
    );
  }

  SourceBindingApiDto sourceBinding(generated.SourceBindingResponseDto dto) {
    return SourceBindingApiDto(
      id: dto.id,
      interestId: dto.interestId,
      providerKey: dto.providerKey,
      capabilityProfileVersion: dto.capabilityProfileVersion,
      status: _bindingStatus(dto.status),
      configPreview: _objectMap(dto.configPreview),
      createdAt: dto.createdAt,
    );
  }

  generated.BindSourceRequestDto bindSource(BindSourceApiRequestDto request) {
    return generated.BindSourceRequestDto(
      providerKey: request.providerKey,
      config: request.config,
    );
  }

  generated.ChangeSourceBindingStatusRequestDto changeStatus(
    ChangeSourceBindingStatusApiRequestDto request,
  ) {
    return generated.ChangeSourceBindingStatusRequestDto(
      status: switch (request.status) {
        'enabled' =>
          generated.ChangeSourceBindingStatusRequestDtoStatusStatus.enabled,
        'paused' =>
          generated.ChangeSourceBindingStatusRequestDtoStatusStatus.paused,
        _ => generated.ChangeSourceBindingStatusRequestDtoStatusStatus.$unknown,
      },
    );
  }

  SourceBindingHealthApiDto health(
    generated.SourceBindingHealthResponseDto dto,
  ) {
    return SourceBindingHealthApiDto(
      sourceBinding: sourceBinding(dto.sourceBinding),
      healthState: _healthState(dto.healthState),
      operatorAction: dto.operatorAction,
      healthExplanation: SourceBindingHealthExplanationApiDto(
        reasonCode: dto.healthExplanation.reasonCode.toJson(),
        message: dto.healthExplanation.message,
        operatorAction: dto.healthExplanation.operatorAction,
        signals: dto.healthExplanation.signals,
        unavailableUntil: dto.healthExplanation.unavailableUntil,
        staleBySeconds: dto.healthExplanation.staleBySeconds,
      ),
      evaluatedAt: dto.evaluatedAt,
      freshness: dto.freshness == null
          ? null
          : SourceBindingFreshnessApiDto(
              isFresh: dto.freshness!.isFresh,
              ageSeconds: dto.freshness!.ageSeconds,
              staleBySeconds: dto.freshness!.staleBySeconds,
            ),
      latestScan: _latestScan(dto.latestScan),
    );
  }

  SourceBindingOverviewApiDto overview(
    generated.ListSourceBindingOverviewResponseDto dto,
  ) {
    return SourceBindingOverviewApiDto(summary: _overviewSummary(dto.summary));
  }

  SourceBindingOverviewSummaryApiDto _overviewSummary(
    generated.SourceBindingOverviewSummaryResponseDto dto,
  ) {
    return SourceBindingOverviewSummaryApiDto(
      totalBindings: dto.totalBindings,
      operatorAction: dto.operatorAction,
      degradationReasons: dto.degradationReasons
          .map(_overviewReason)
          .toList(growable: false),
      providerBreakdown: dto.providerBreakdown
          .map(_providerBreakdown)
          .toList(growable: false),
      nextEligibleAt: dto.nextEligibleAt,
    );
  }

  SourceBindingOverviewProviderBreakdownApiDto _providerBreakdown(
    generated.SourceBindingOverviewProviderBreakdownResponseDto dto,
  ) {
    return SourceBindingOverviewProviderBreakdownApiDto(
      providerKey: dto.providerKey,
      totalBindings: dto.totalBindings,
      degradationReasons: dto.degradationReasons
          .map(_overviewReason)
          .toList(growable: false),
      nextEligibleAt: dto.nextEligibleAt,
    );
  }

  SourceBindingOverviewDegradationReasonApiDto _overviewReason(
    generated.SourceBindingOverviewDegradationReasonResponseDto dto,
  ) {
    return SourceBindingOverviewDegradationReasonApiDto(
      code: dto.code.toJson(),
      severity: dto.severity.toJson(),
      affectedBindings: dto.affectedBindings,
      operatorAction: dto.operatorAction,
      sampleSourceBindingIds: dto.sampleSourceBindingIds,
      signals: dto.signals,
      nextEligibleAt: dto.nextEligibleAt,
    );
  }

  SourceBindingScanSummaryApiDto? _latestScan(
    generated.SourceBindingHealthScanResponseDto? dto,
  ) {
    if (dto == null) {
      return null;
    }
    return SourceBindingScanSummaryApiDto(
      scanJobId: dto.scanJobId,
      status: dto.status.toJson(),
      userState: dto.userState.toJson(),
      operatorAction: dto.operatorAction,
      failureClass: dto.failureClass?.toJson(),
      failureReason: dto.failureReason,
      fetched: dto.latestAttempt?.fetched,
      inserted: dto.latestAttempt?.inserted,
      skippedDuplicates: dto.latestAttempt?.skippedDuplicates,
      projected: dto.latestAttempt?.projected,
    );
  }

  String _bindingStatus(generated.SourceBindingResponseDtoStatusStatus status) {
    return switch (status) {
      generated.SourceBindingResponseDtoStatusStatus.enabled => 'enabled',
      generated.SourceBindingResponseDtoStatusStatus.paused => 'paused',
      generated.SourceBindingResponseDtoStatusStatus.$unknown => 'unknown',
    };
  }

  String _healthState(
    generated.SourceBindingHealthResponseDtoHealthStateHealthState state,
  ) {
    return switch (state) {
      generated.SourceBindingHealthResponseDtoHealthStateHealthState.paused =>
        'paused',
      generated
          .SourceBindingHealthResponseDtoHealthStateHealthState
          .notConfigured =>
        'not_configured',
      generated
          .SourceBindingHealthResponseDtoHealthStateHealthState
          .scheduled =>
        'scheduled',
      generated.SourceBindingHealthResponseDtoHealthStateHealthState.scanning =>
        'scanning',
      generated.SourceBindingHealthResponseDtoHealthStateHealthState.healthy =>
        'healthy',
      generated.SourceBindingHealthResponseDtoHealthStateHealthState.stale =>
        'stale',
      generated
          .SourceBindingHealthResponseDtoHealthStateHealthState
          .rateLimited =>
        'rate_limited',
      generated
          .SourceBindingHealthResponseDtoHealthStateHealthState
          .authFailed =>
        'auth_failed',
      generated.SourceBindingHealthResponseDtoHealthStateHealthState.degraded =>
        'degraded',
      generated
          .SourceBindingHealthResponseDtoHealthStateHealthState
          .unsupportedScope =>
        'unsupported_scope',
      generated.SourceBindingHealthResponseDtoHealthStateHealthState.down =>
        'down',
      generated.SourceBindingHealthResponseDtoHealthStateHealthState.$unknown =>
        'unknown',
    };
  }

  Map<String, Object?> _objectMap(Object? value) {
    if (value is! Map) {
      return const {};
    }
    return Map<String, Object?>.fromEntries(
      value.entries.where((entry) => entry.key is String).map((entry) {
        return MapEntry(entry.key as String, _jsonValue(entry.value));
      }),
    );
  }

  Object? _jsonValue(Object? value) {
    if (value == null || value is String || value is num || value is bool) {
      return value;
    }
    if (value is List) {
      return value.map((item) => _jsonValue(item)).toList(growable: false);
    }
    if (value is Map) {
      return _objectMap(value);
    }
    return '$value';
  }
}
