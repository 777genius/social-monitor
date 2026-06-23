import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/source_profile_api_dto.dart';
import '../mappers/generated_source_profile_rest_mapper.dart';
import 'source_profiles_api_client.dart';

final class GeneratedSourceProfilesApiClient
    implements SourceProfilesApiClient {
  GeneratedSourceProfilesApiClient({
    required generated.GeneratedApiRuntime runtime,
    GeneratedSourceProfileRestMapper mapper =
        const GeneratedSourceProfileRestMapper(),
  }) : _runtime = runtime,
       _mapper = mapper;

  factory GeneratedSourceProfilesApiClient.fromRuntime({
    required Object runtime,
    GeneratedSourceProfileRestMapper mapper =
        const GeneratedSourceProfileRestMapper(),
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedSourceProfilesApiClient(runtime: runtime, mapper: mapper);
  }

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedSourceProfileRestMapper _mapper;

  @override
  Future<Result<ListSourceProfilesApiResponseDto>> listSourceProfiles(
    WorkspaceScope scope,
  ) async {
    final result = await _runtime.client
        .send<generated.ListSourceProfilesResponseDto>(
          generated.WorkspaceRequest(scope: scope),
          () => _runtime.rest.sources.sourceProfileControllerList(),
        );

    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.listSourceProfiles(dto)),
      onFailure: Result<ListSourceProfilesApiResponseDto>.failure,
    );
  }
}
