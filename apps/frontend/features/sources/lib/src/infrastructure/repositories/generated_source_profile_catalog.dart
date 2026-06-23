import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/source_profile_catalog.dart';
import '../../application/queries/list_source_profiles_query.dart';
import '../../domain/entities/source_profile.dart';
import '../api_clients/source_profiles_api_client.dart';
import '../mappers/source_profile_mapper.dart';

final class GeneratedSourceProfileCatalog implements SourceProfileCatalog {
  const GeneratedSourceProfileCatalog({
    required SourceProfilesApiClient apiClient,
    SourceProfileMapper mapper = const SourceProfileMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper;

  final SourceProfilesApiClient _apiClient;
  final SourceProfileMapper _mapper;

  @override
  Future<Result<PageResult<SourceProfile>>> listSourceProfiles(
    ListSourceProfilesQuery query,
  ) async {
    final result = await _apiClient.listSourceProfiles(query.scope);
    return result.fold(
      onSuccess: (response) => Result.success(
        PageResult<SourceProfile>(
          items: response.items.map(_mapper.toDomain).toList(growable: false),
          request: const PageRequest(),
        ),
      ),
      onFailure: Result<PageResult<SourceProfile>>.failure,
    );
  }
}
