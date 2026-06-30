import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class SourceBindingListApiRequestDto {
  const SourceBindingListApiRequestDto({
    required this.scope,
    required this.interestId,
    required this.page,
  });

  final WorkspaceScope scope;
  final String interestId;
  final PageRequest page;
}

final class SourceBindingApiDto {
  const SourceBindingApiDto({
    required this.id,
    required this.interestId,
    required this.providerKey,
    required this.capabilityProfileVersion,
    required this.status,
    required this.configPreview,
    required this.createdAt,
  });

  final String id;
  final String interestId;
  final String providerKey;
  final num capabilityProfileVersion;
  final String status;
  final Map<String, Object?> configPreview;
  final DateTime createdAt;

  SourceBindingApiDto copyWith({
    String? status,
    Map<String, Object?>? configPreview,
  }) {
    return SourceBindingApiDto(
      id: id,
      interestId: interestId,
      providerKey: providerKey,
      capabilityProfileVersion: capabilityProfileVersion,
      status: status ?? this.status,
      configPreview: configPreview ?? this.configPreview,
      createdAt: createdAt,
    );
  }
}

final class ListSourceBindingsApiResponseDto {
  const ListSourceBindingsApiResponseDto({
    required this.items,
    this.nextCursor,
  });

  final List<SourceBindingApiDto> items;
  final String? nextCursor;
}

final class BindSourceApiRequestDto {
  const BindSourceApiRequestDto({
    required this.scope,
    required this.interestId,
    required this.providerKey,
    required this.config,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final String interestId;
  final String providerKey;
  final Map<String, Object?> config;
  final String idempotencyKey;
}

final class ChangeSourceBindingStatusApiRequestDto {
  const ChangeSourceBindingStatusApiRequestDto({
    required this.scope,
    required this.interestId,
    required this.sourceBindingId,
    required this.status,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final String interestId;
  final String sourceBindingId;
  final String status;
  final String idempotencyKey;
}

final class SourceBindingHealthApiRequestDto {
  const SourceBindingHealthApiRequestDto({
    required this.scope,
    required this.interestId,
    required this.sourceBindingId,
  });

  final WorkspaceScope scope;
  final String interestId;
  final String sourceBindingId;
}

final class SourceBindingOverviewApiRequestDto {
  const SourceBindingOverviewApiRequestDto({
    required this.scope,
    required this.interestId,
    required this.page,
  });

  final WorkspaceScope scope;
  final String interestId;
  final PageRequest page;
}

final class SourceBindingOverviewApiDto {
  const SourceBindingOverviewApiDto({required this.summary});

  final SourceBindingOverviewSummaryApiDto summary;
}

final class SourceBindingOverviewSummaryApiDto {
  const SourceBindingOverviewSummaryApiDto({
    required this.totalBindings,
    required this.operatorAction,
    required this.degradationReasons,
    required this.providerBreakdown,
    this.nextEligibleAt,
  });

  final num totalBindings;
  final String operatorAction;
  final List<SourceBindingOverviewDegradationReasonApiDto> degradationReasons;
  final List<SourceBindingOverviewProviderBreakdownApiDto> providerBreakdown;
  final DateTime? nextEligibleAt;
}

final class SourceBindingOverviewProviderBreakdownApiDto {
  const SourceBindingOverviewProviderBreakdownApiDto({
    required this.providerKey,
    required this.totalBindings,
    required this.degradationReasons,
    this.nextEligibleAt,
  });

  final String providerKey;
  final num totalBindings;
  final List<SourceBindingOverviewDegradationReasonApiDto> degradationReasons;
  final DateTime? nextEligibleAt;
}

final class SourceBindingOverviewDegradationReasonApiDto {
  const SourceBindingOverviewDegradationReasonApiDto({
    required this.code,
    required this.severity,
    required this.affectedBindings,
    required this.operatorAction,
    required this.sampleSourceBindingIds,
    required this.signals,
    this.nextEligibleAt,
  });

  final String code;
  final String severity;
  final num affectedBindings;
  final String operatorAction;
  final List<String> sampleSourceBindingIds;
  final List<String> signals;
  final DateTime? nextEligibleAt;
}
