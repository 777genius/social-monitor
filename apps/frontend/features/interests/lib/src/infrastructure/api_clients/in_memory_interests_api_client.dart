import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/queries/list_interests_query.dart';
import '../../domain/value_objects/interest_lifecycle_status.dart';
import '../api/interest_mutation_api_dto.dart';
import '../api/interest_summary_api_dto.dart';

abstract interface class InterestsApiClient {
  Future<Result<ListInterestsApiResponseDto>> listInterests(
    ListInterestsApiRequest request,
  );

  Future<Result<InterestSummaryApiDto>> createInterest(
    CreateInterestApiRequestDto request,
  );

  Future<Result<InterestSummaryApiDto>> updateInterest(
    UpdateInterestApiRequestDto request,
  );

  Future<Result<InterestSummaryApiDto>> archiveInterest(
    ArchiveInterestApiRequestDto request,
  );
}

final class ListInterestsApiRequest {
  const ListInterestsApiRequest({
    required this.scope,
    required this.page,
    required this.search,
    this.status,
  });

  factory ListInterestsApiRequest.fromQuery(ListInterestsQuery query) {
    return ListInterestsApiRequest(
      scope: query.scope,
      page: query.page,
      search: query.search,
      status: query.status,
    );
  }

  final WorkspaceScope scope;
  final PageRequest page;
  final String search;
  final InterestLifecycleStatus? status;
}

final class InMemoryInterestsApiClient implements InterestsApiClient {
  InMemoryInterestsApiClient({
    required List<InterestSummaryApiDto> items,
    this.latency = Duration.zero,
  }) : _items = List<InterestSummaryApiDto>.of(items);

  final List<InterestSummaryApiDto> _items;
  final Duration latency;

  @override
  Future<Result<ListInterestsApiResponseDto>> listInterests(
    ListInterestsApiRequest request,
  ) async {
    if (latency > Duration.zero) {
      await Future<void>.delayed(latency);
    }

    if (!request.scope.isValid) {
      final failure = const ApiProblem(
        title: 'Workspace required',
        status: 403,
        detail: 'A valid workspace is required to list interests',
      ).toFailure();
      return Result.failure(failure);
    }

    final normalized = request.page.normalized();
    final search = request.search.trim().toLowerCase();
    final status = request.status;
    final offset = int.tryParse(normalized.cursor ?? '') ?? 0;
    final filtered = _items
        .where((item) {
          final matchesSearch =
              search.isEmpty ||
              (item.name ?? '').toLowerCase().contains(search) ||
              (item.query ?? '').toLowerCase().contains(search);
          final matchesStatus = status == null || _statusMatches(item, status);
          return matchesSearch && matchesStatus;
        })
        .toList(growable: false);
    final end = (offset + normalized.limit).clamp(0, filtered.length);
    final pageItems = filtered.sublist(offset.clamp(0, filtered.length), end);
    final nextCursor = end < filtered.length ? '$end' : null;

    return Result.success(
      ListInterestsApiResponseDto(items: pageItems, nextCursor: nextCursor),
    );
  }

  @override
  Future<Result<InterestSummaryApiDto>> createInterest(
    CreateInterestApiRequestDto request,
  ) async {
    await _delayIfNeeded();
    final created = InterestSummaryApiDto(
      id: _nextId(request.name),
      name: request.name,
      query: request.query,
      status: 'draft',
      weeklyMentionCount: 0,
    );
    _items.insert(0, created);
    return Result.success(created);
  }

  @override
  Future<Result<InterestSummaryApiDto>> updateInterest(
    UpdateInterestApiRequestDto request,
  ) async {
    await _delayIfNeeded();
    final index = _items.indexWhere((item) => item.id == request.id);
    if (index == -1) {
      return Result.failure(_notFoundFailure(request.id));
    }
    final current = _items[index];
    final updated = InterestSummaryApiDto(
      id: current.id,
      name: request.name,
      query: request.query,
      status: current.status,
      weeklyMentionCount: current.weeklyMentionCount,
    );
    _items[index] = updated;
    return Result.success(updated);
  }

  @override
  Future<Result<InterestSummaryApiDto>> archiveInterest(
    ArchiveInterestApiRequestDto request,
  ) async {
    await _delayIfNeeded();
    final index = _items.indexWhere((item) => item.id == request.id);
    if (index == -1) {
      return Result.failure(_notFoundFailure(request.id));
    }
    final current = _items[index];
    final archived = InterestSummaryApiDto(
      id: current.id,
      name: current.name,
      query: current.query,
      status: 'archived',
      weeklyMentionCount: current.weeklyMentionCount,
    );
    _items[index] = archived;
    return Result.success(archived);
  }

  Future<void> _delayIfNeeded() async {
    if (latency > Duration.zero) {
      await Future<void>.delayed(latency);
    }
  }

  String _nextId(String name) {
    final slug = name
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-|-$'), '');
    final safeSlug = slug.isEmpty ? 'interest' : slug;
    return 'interest-$safeSlug-${_items.length + 1}';
  }

  AppFailure _notFoundFailure(String interestId) {
    return ApiProblem(
      title: 'Interest not found',
      status: 404,
      detail: 'Interest $interestId is not available in this workspace',
    ).toFailure();
  }

  bool _statusMatches(
    InterestSummaryApiDto item,
    InterestLifecycleStatus status,
  ) {
    return switch (status) {
      InterestLifecycleStatus.active => item.status.toLowerCase() == 'active',
      InterestLifecycleStatus.draft => item.status.toLowerCase() == 'draft',
      InterestLifecycleStatus.archived =>
        item.status.toLowerCase() == 'archived',
      InterestLifecycleStatus.unknown => !_knownStatuses.contains(
        item.status.toLowerCase(),
      ),
    };
  }

  static const _knownStatuses = {'active', 'draft', 'archived'};
}
