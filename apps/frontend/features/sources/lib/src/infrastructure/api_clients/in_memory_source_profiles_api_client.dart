import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/source_profile_api_dto.dart';
import 'source_profiles_api_client.dart';

final class InMemorySourceProfilesApiClient implements SourceProfilesApiClient {
  const InMemorySourceProfilesApiClient({required this.items});

  final List<SourceProfileApiDto> items;

  @override
  Future<Result<ListSourceProfilesApiResponseDto>> listSourceProfiles(
    WorkspaceScope scope,
  ) async {
    if (!scope.isValid) {
      return Result.failure(
        const ApiProblem(
          title: 'Workspace required',
          status: 403,
          detail: 'A valid workspace is required to list source profiles',
        ).toFailure(),
      );
    }
    return Result.success(
      ListSourceProfilesApiResponseDto(
        items: List<SourceProfileApiDto>.unmodifiable(items),
      ),
    );
  }
}
