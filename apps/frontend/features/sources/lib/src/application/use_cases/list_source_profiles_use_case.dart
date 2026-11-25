import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_profile.dart';
import '../contracts/source_profile_catalog.dart';
import '../queries/list_source_profiles_query.dart';

final class ListSourceProfilesUseCase {
  const ListSourceProfilesUseCase(this._catalog);

  final SourceProfileCatalog _catalog;

  Future<Result<PageResult<SourceProfile>>> call(
    ListSourceProfilesQuery query,
  ) {
    if (!query.scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'source_profiles.workspace_scope_required',
          ),
        ),
      );
    }
    return _catalog.listSourceProfiles(query);
  }
}
