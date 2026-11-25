import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/archive_interest_command.dart';
import '../../application/commands/create_interest_command.dart';
import '../../application/commands/update_interest_command.dart';
import '../../application/contracts/interest_catalog.dart';
import '../../application/queries/list_interests_query.dart';
import '../../domain/entities/interest_summary.dart';
import '../api/interest_summary_api_dto.dart';
import '../api_clients/in_memory_interests_api_client.dart';
import '../mappers/interest_mutation_mapper.dart';
import '../mappers/interest_summary_mapper.dart';

final class GeneratedInterestCatalog implements InterestCatalog {
  const GeneratedInterestCatalog({
    required InterestsApiClient apiClient,
    InterestSummaryMapper mapper = const InterestSummaryMapper(),
    InterestMutationMapper mutationMapper = const InterestMutationMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper,
       _mutationMapper = mutationMapper;

  final InterestsApiClient _apiClient;
  final InterestSummaryMapper _mapper;
  final InterestMutationMapper _mutationMapper;

  @override
  Future<Result<PageResult<InterestSummary>>> listInterests(
    ListInterestsQuery query,
  ) async {
    final result = await _apiClient.listInterests(
      ListInterestsApiRequest.fromQuery(query),
    );

    return result.fold(
      onSuccess: (response) {
        final page = PageResult<InterestSummary>(
          items: response.items.map(_mapper.toDomain).toList(growable: false),
          request: query.page,
          nextCursor: response.nextCursor,
          isPartial: response.isPartial,
        );
        return Result.success(page);
      },
      onFailure: Result<PageResult<InterestSummary>>.failure,
    );
  }

  @override
  Future<Result<InterestSummary>> createInterest(
    CreateInterestCommand command,
  ) async {
    final result = await _apiClient.createInterest(
      _mutationMapper.createRequest(command),
    );
    return _mapInterestResult(result);
  }

  @override
  Future<Result<InterestSummary>> updateInterest(
    UpdateInterestCommand command,
  ) async {
    final result = await _apiClient.updateInterest(
      _mutationMapper.updateRequest(command),
    );
    return _mapInterestResult(result);
  }

  @override
  Future<Result<InterestSummary>> archiveInterest(
    ArchiveInterestCommand command,
  ) async {
    final result = await _apiClient.archiveInterest(
      _mutationMapper.archiveRequest(command),
    );
    return _mapInterestResult(result);
  }

  Result<InterestSummary> _mapInterestResult(
    Result<InterestSummaryApiDto> result,
  ) {
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<InterestSummary>.failure,
    );
  }
}
