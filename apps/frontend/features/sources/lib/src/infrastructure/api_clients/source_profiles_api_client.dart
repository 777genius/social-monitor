import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/source_profile_api_dto.dart';

abstract interface class SourceProfilesApiClient {
  Future<Result<ListSourceProfilesApiResponseDto>> listSourceProfiles(
    WorkspaceScope scope,
  );
}
