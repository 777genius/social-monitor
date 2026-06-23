import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/source_profile_api_dto.dart';

final class GeneratedSourceProfileRestMapper {
  const GeneratedSourceProfileRestMapper();

  ListSourceProfilesApiResponseDto listSourceProfiles(
    generated.ListSourceProfilesResponseDto dto,
  ) {
    return ListSourceProfilesApiResponseDto(
      items: dto.sources.map(sourceProfile).toList(growable: false),
    );
  }

  SourceProfileApiDto sourceProfile(generated.SourceProfileDto dto) {
    return SourceProfileApiDto(
      providerKey: dto.providerKey,
      displayName: dto.displayName,
      productionSafe: dto.productionSafe,
      readinessState: dto.readinessState.toJson(),
      runtimeReadiness: dto.runtimeReadiness.toJson(),
      acquisitionMode: dto.acquisitionMode,
      supportedQueryModes: dto.supportedQueryModes,
      supportedContentUnits: dto.supportedContentUnits,
      cursorModel: dto.cursorModel,
      quotaModel: dto.quotaModel,
      limitations: dto.limitations,
      liveBetaBlockers: dto.liveBetaBlockers,
      capabilityVersion: dto.capabilityVersion,
    );
  }
}
