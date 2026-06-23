final class SourceProfileApiDto {
  const SourceProfileApiDto({
    required this.providerKey,
    required this.productionSafe,
    required this.readinessState,
    required this.runtimeReadiness,
    required this.acquisitionMode,
    required this.supportedQueryModes,
    required this.supportedContentUnits,
    required this.cursorModel,
    required this.quotaModel,
    required this.limitations,
    required this.liveBetaBlockers,
    this.displayName,
    this.capabilityVersion,
  });

  final String providerKey;
  final String? displayName;
  final bool productionSafe;
  final String readinessState;
  final String runtimeReadiness;
  final String acquisitionMode;
  final List<String> supportedQueryModes;
  final List<String> supportedContentUnits;
  final String cursorModel;
  final String quotaModel;
  final List<String> limitations;
  final List<String> liveBetaBlockers;
  final num? capabilityVersion;
}

final class ListSourceProfilesApiResponseDto {
  const ListSourceProfilesApiResponseDto({required this.items});

  final List<SourceProfileApiDto> items;
}
