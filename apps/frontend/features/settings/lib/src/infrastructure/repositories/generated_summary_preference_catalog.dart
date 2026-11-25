import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/save_summary_preference_command.dart';
import '../../application/contracts/summary_preference_catalog.dart';
import '../../application/queries/load_summary_preference_query.dart';
import '../../domain/entities/summary_preference.dart';
import '../api/summary_preference_api_dto.dart';
import '../api_clients/summary_preference_api_client.dart';
import '../mappers/summary_preference_mapper.dart';

final class GeneratedSummaryPreferenceCatalog
    implements SummaryPreferenceCatalog {
  const GeneratedSummaryPreferenceCatalog({
    required SummaryPreferenceApiClient apiClient,
    SummaryPreferenceMapper mapper = const SummaryPreferenceMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper;

  final SummaryPreferenceApiClient _apiClient;
  final SummaryPreferenceMapper _mapper;

  @override
  Future<Result<SummaryPreference>> loadSummaryPreference(
    LoadSummaryPreferenceQuery query,
  ) async {
    final result = await _apiClient.loadSummaryPreference(
      LoadSummaryPreferenceApiRequest.fromQuery(query),
    );
    return _mapPreference(result);
  }

  @override
  Future<Result<SummaryPreference>> saveSummaryPreference(
    SaveSummaryPreferenceCommand command,
  ) async {
    final result = await _apiClient.saveSummaryPreference(
      SaveSummaryPreferenceApiRequest.fromCommand(command),
    );
    return _mapPreference(result);
  }

  Result<SummaryPreference> _mapPreference(
    Result<SummaryPreferenceApiDto> result,
  ) {
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<SummaryPreference>.failure,
    );
  }
}
