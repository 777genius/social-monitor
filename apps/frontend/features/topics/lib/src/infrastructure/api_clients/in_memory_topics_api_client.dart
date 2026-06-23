import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/queries/list_topics_query.dart';
import '../../domain/value_objects/topic_lifecycle_status.dart';
import '../api/topic_mutation_api_dto.dart';
import '../api/topic_summary_api_dto.dart';

abstract interface class TopicsApiClient {
  Future<Result<ListTopicsApiResponseDto>> listTopics(
    ListTopicsApiRequest request,
  );

  Future<Result<TopicSummaryApiDto>> createTopic(
    CreateTopicApiRequestDto request,
  );

  Future<Result<TopicSummaryApiDto>> updateTopic(
    UpdateTopicApiRequestDto request,
  );

  Future<Result<TopicSummaryApiDto>> archiveTopic(
    ArchiveTopicApiRequestDto request,
  );
}

final class ListTopicsApiRequest {
  const ListTopicsApiRequest({
    required this.scope,
    required this.page,
    required this.search,
    this.status,
  });

  factory ListTopicsApiRequest.fromQuery(ListTopicsQuery query) {
    return ListTopicsApiRequest(
      scope: query.scope,
      page: query.page,
      search: query.search,
      status: query.status,
    );
  }

  final WorkspaceScope scope;
  final PageRequest page;
  final String search;
  final TopicLifecycleStatus? status;
}

final class InMemoryTopicsApiClient implements TopicsApiClient {
  InMemoryTopicsApiClient({
    required List<TopicSummaryApiDto> items,
    this.latency = Duration.zero,
  }) : _items = List<TopicSummaryApiDto>.of(items);

  final List<TopicSummaryApiDto> _items;
  final Duration latency;

  @override
  Future<Result<ListTopicsApiResponseDto>> listTopics(
    ListTopicsApiRequest request,
  ) async {
    if (latency > Duration.zero) {
      await Future<void>.delayed(latency);
    }

    if (!request.scope.isValid) {
      final failure = const ApiProblem(
        title: 'Workspace required',
        status: 403,
        detail: 'A valid workspace is required to list topics',
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
      ListTopicsApiResponseDto(items: pageItems, nextCursor: nextCursor),
    );
  }

  @override
  Future<Result<TopicSummaryApiDto>> createTopic(
    CreateTopicApiRequestDto request,
  ) async {
    await _delayIfNeeded();
    final created = TopicSummaryApiDto(
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
  Future<Result<TopicSummaryApiDto>> updateTopic(
    UpdateTopicApiRequestDto request,
  ) async {
    await _delayIfNeeded();
    final index = _items.indexWhere((item) => item.id == request.id);
    if (index == -1) {
      return Result.failure(_notFoundFailure(request.id));
    }
    final current = _items[index];
    final updated = TopicSummaryApiDto(
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
  Future<Result<TopicSummaryApiDto>> archiveTopic(
    ArchiveTopicApiRequestDto request,
  ) async {
    await _delayIfNeeded();
    final index = _items.indexWhere((item) => item.id == request.id);
    if (index == -1) {
      return Result.failure(_notFoundFailure(request.id));
    }
    final current = _items[index];
    final archived = TopicSummaryApiDto(
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
    final safeSlug = slug.isEmpty ? 'topic' : slug;
    return 'topic-$safeSlug-${_items.length + 1}';
  }

  AppFailure _notFoundFailure(String topicId) {
    return ApiProblem(
      title: 'Topic not found',
      status: 404,
      detail: 'Topic $topicId is not available in this workspace',
    ).toFailure();
  }

  bool _statusMatches(TopicSummaryApiDto item, TopicLifecycleStatus status) {
    return switch (status) {
      TopicLifecycleStatus.active => item.status.toLowerCase() == 'active',
      TopicLifecycleStatus.draft => item.status.toLowerCase() == 'draft',
      TopicLifecycleStatus.archived => item.status.toLowerCase() == 'archived',
      TopicLifecycleStatus.unknown => !_knownStatuses.contains(
        item.status.toLowerCase(),
      ),
    };
  }

  static const _knownStatuses = {'active', 'draft', 'archived'};
}
