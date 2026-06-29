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
