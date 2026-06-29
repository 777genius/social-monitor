import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/feed_item_api_dto.dart';
import 'feed_items_api_client.dart';

final class InMemoryFeedItemsApiClient implements FeedItemsApiClient {
  InMemoryFeedItemsApiClient({required List<FeedItemApiDto> items})
    : _items = List<FeedItemApiDto>.of(items);

  final List<FeedItemApiDto> _items;

  @override
  Future<Result<ListFeedItemsApiResponseDto>> listFeedItems(
    ListFeedItemsApiRequestDto request,
  ) async {
    if (!request.scope.isValid) {
      return Result.failure(
        const ApiProblem(
          title: 'Workspace required',
          status: 403,
          detail: 'A valid workspace is required to list feed items',
        ).toFailure(),
      );
    }

    final search = request.search.trim().toLowerCase();
    final interestId = request.interestId?.trim();
    final providerKey = request.providerKey?.trim().toLowerCase();
    final repositoryTrendWindow = request.repositoryTrendWindow?.trim();
    final repositoryLanguage = request.repositoryLanguage?.trim();
    final repositoryTopic = request.repositoryTopic?.trim();
    final filtered = _items
        .where((item) {
          final matchesSearch =
              search.isEmpty ||
              item.title.toLowerCase().contains(search) ||
              item.bodyPreview.toLowerCase().contains(search);
          final matchesTopic =
              interestId == null ||
              interestId.isEmpty ||
              item.interestId == interestId;
          final matchesProvider =
              providerKey == null ||
              providerKey.isEmpty ||
              item.providerKey.toLowerCase() == providerKey;
          final matchesRepositoryTrend = _matchesRepositoryTrend(
            item.providerMetadata,
            trendWindow: repositoryTrendWindow,
            language: repositoryLanguage,
            topic: repositoryTopic,
          );
          return matchesSearch &&
              matchesTopic &&
              matchesProvider &&
              matchesRepositoryTrend;
        })
        .toList(growable: false);
    final offset = int.tryParse(request.page.cursor ?? '') ?? 0;
    final start = offset.clamp(0, filtered.length);
    final end = (start + request.page.limit).clamp(0, filtered.length);
    return Result.success(
      ListFeedItemsApiResponseDto(
        items: filtered.sublist(start, end),
        nextCursor: end < filtered.length ? '$end' : null,
      ),
    );
  }

  @override
  Future<Result<FeedItemApiDto>> loadFeedItem({
    required WorkspaceScope scope,
    required String feedItemId,
  }) async {
    if (!scope.isValid) {
      return Result.failure(
        const ApiProblem(
          title: 'Workspace required',
          status: 403,
          detail: 'A valid workspace is required to load feed items',
        ).toFailure(),
      );
    }
    for (final item in _items) {
      if (item.id == feedItemId) {
        return Result.success(item);
      }
    }
    return Result.failure(
      ApiProblem(
        title: 'Feed item not found',
        status: 404,
        detail: 'Feed item $feedItemId is not available',
      ).toFailure(),
    );
  }
}

bool _matchesRepositoryTrend(
  Object? metadata, {
  required String? trendWindow,
  required String? language,
  required String? topic,
}) {
  if (_isBlank(trendWindow) && _isBlank(language) && _isBlank(topic)) {
    return true;
  }

  final record = _readRecord(metadata);
  if (record == null || record['kind'] != 'github_repository_trend') {
    return false;
  }

  final repository = _readRecord(record['repository']);
  final trend = _readRecord(record['trend']);
  if (repository == null || trend == null) {
    return false;
  }

  if (!_isBlank(trendWindow) && trend['primaryWindow'] != trendWindow) {
    return false;
  }

  if (!_isBlank(language) &&
      _normalize(repository['language']) != _normalize(language)) {
    return false;
  }

  if (!_isBlank(topic)) {
    final normalizedTopic = _normalize(topic);
    final topics = repository['topics'];
    final hasTopic =
        topics is List &&
        topics.whereType<String>().any(
          (candidate) => _normalize(candidate) == normalizedTopic,
        );
    if (!hasTopic) {
      return false;
    }
  }

  return true;
}

Map<String, Object?>? _readRecord(Object? value) {
  if (value is Map<String, Object?>) {
    return value;
  }
  if (value is Map) {
    return {
      for (final entry in value.entries)
        if (entry.key is String) entry.key as String: entry.value,
    };
  }
  return null;
}

bool _isBlank(String? value) => value == null || value.trim().isEmpty;

String _normalize(Object? value) =>
    value is String ? value.trim().toLowerCase() : '';
