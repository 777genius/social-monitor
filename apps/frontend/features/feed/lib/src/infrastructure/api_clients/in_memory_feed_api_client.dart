import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/queries/list_feed_mentions_query.dart';
import '../../domain/value_objects/mention_id.dart';
import '../../domain/value_objects/mention_triage_state.dart';
import '../api/feed_mention_api_dto.dart';

abstract interface class FeedApiClient {
  Future<Result<FeedMentionPageApiDto>> listMentions(
    ListFeedMentionsApiRequest request,
  );

  Future<Result<FeedMentionApiDto>> triageMention(
    MentionId mentionId,
    MentionTriageState nextState,
  );
}

final class ListFeedMentionsApiRequest {
  const ListFeedMentionsApiRequest({
    required this.scope,
    required this.cursor,
    required this.limit,
    required this.search,
    this.triageState,
  });

  factory ListFeedMentionsApiRequest.fromQuery(ListFeedMentionsQuery query) {
    final normalized = query.normalized();
    return ListFeedMentionsApiRequest(
      scope: normalized.scope,
      cursor: normalized.page.cursor,
      limit: normalized.page.limit,
      search: normalized.filter.search,
      triageState: normalized.filter.triageState,
    );
  }

  final WorkspaceScope scope;
  final String? cursor;
  final int limit;
  final String search;
  final MentionTriageState? triageState;
}

final class InMemoryFeedApiClient implements FeedApiClient {
  InMemoryFeedApiClient({required List<FeedMentionApiDto> items})
    : _items = List<FeedMentionApiDto>.of(items);

  final List<FeedMentionApiDto> _items;

  @override
  Future<Result<FeedMentionPageApiDto>> listMentions(
    ListFeedMentionsApiRequest request,
  ) async {
    if (!request.scope.isValid) {
      return Result.failure(
        const ApiProblem(
          title: 'Workspace required',
          status: 403,
          detail: 'A valid workspace is required to list feed mentions',
        ).toFailure(),
      );
    }

    final search = request.search.trim().toLowerCase();
    final filtered = _items
        .where((item) {
          final matchesSearch =
              search.isEmpty || item.title.toLowerCase().contains(search);
          final matchesTriage =
              request.triageState == null ||
              _triageMatches(item.triageState, request.triageState!);
          return matchesSearch && matchesTriage;
        })
        .toList(growable: false);
    final offset = int.tryParse(request.cursor ?? '') ?? 0;
    final start = offset.clamp(0, filtered.length);
    final end = (start + request.limit).clamp(0, filtered.length);
    return Result.success(
      FeedMentionPageApiDto(
        items: filtered.sublist(start, end),
        nextCursor: end < filtered.length ? '$end' : null,
      ),
    );
  }

  @override
  Future<Result<FeedMentionApiDto>> triageMention(
    MentionId mentionId,
    MentionTriageState nextState,
  ) async {
    final index = _items.indexWhere((item) => item.id == mentionId.value);
    if (index == -1) {
      return Result.failure(
        ApiProblem(
          title: 'Mention not found',
          status: 404,
          detail: 'Mention ${mentionId.value} is not available',
        ).toFailure(),
      );
    }
    final current = _items[index];
    final updated = FeedMentionApiDto(
      id: current.id,
      title: current.title,
      sourceName: current.sourceName,
      sentiment: current.sentiment,
      triageState: _triageToApi(nextState),
      rawEvidenceText: current.rawEvidenceText,
      provenanceLabel: current.provenanceLabel,
    );
    _items[index] = updated;
    return Result.success(updated);
  }

  bool _triageMatches(String value, MentionTriageState state) {
    return switch (state) {
      MentionTriageState.needsTriage => value == 'needs_triage',
      MentionTriageState.reviewed => value == 'reviewed',
      MentionTriageState.escalated => value == 'escalated',
      MentionTriageState.unknown => false,
    };
  }

  String _triageToApi(MentionTriageState state) {
    return switch (state) {
      MentionTriageState.needsTriage => 'needs_triage',
      MentionTriageState.reviewed => 'reviewed',
      MentionTriageState.escalated => 'escalated',
      MentionTriageState.unknown => 'unknown',
    };
  }
}
