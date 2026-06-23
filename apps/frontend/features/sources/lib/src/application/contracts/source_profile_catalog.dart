import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_profile.dart';
import '../queries/list_source_profiles_query.dart';

abstract interface class SourceProfileCatalog {
  Future<Result<PageResult<SourceProfile>>> listSourceProfiles(
    ListSourceProfilesQuery query,
  );
}
