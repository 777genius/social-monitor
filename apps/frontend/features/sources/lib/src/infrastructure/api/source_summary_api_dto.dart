final class SourceSummaryApiDto {
  const SourceSummaryApiDto({
    required this.id,
    required this.name,
    required this.credentialHealth,
    required this.healthLabel,
    required this.capabilityKey,
    required this.capabilityEnabled,
    required this.collectionStatus,
    this.capabilityDisabledReasonCode,
    this.credentialPreview,
  });

  final String id;
  final String name;
  final String credentialHealth;
  final String healthLabel;
  final String capabilityKey;
  final bool capabilityEnabled;
  final String collectionStatus;
  final String? capabilityDisabledReasonCode;
  final String? credentialPreview;

  SourceSummaryApiDto copyWith({
    String? credentialHealth,
    String? healthLabel,
    String? collectionStatus,
  }) {
    return SourceSummaryApiDto(
      id: id,
      name: name,
      credentialHealth: credentialHealth ?? this.credentialHealth,
      healthLabel: healthLabel ?? this.healthLabel,
      capabilityKey: capabilityKey,
      capabilityEnabled: capabilityEnabled,
      collectionStatus: collectionStatus ?? this.collectionStatus,
      capabilityDisabledReasonCode: capabilityDisabledReasonCode,
      credentialPreview: credentialPreview,
    );
  }
}
