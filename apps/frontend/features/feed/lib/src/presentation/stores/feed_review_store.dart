import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/triage_mention_command.dart';
import '../../application/queries/list_feed_mentions_query.dart';
import '../../application/use_cases/list_feed_mentions_use_case.dart';
import '../../application/use_cases/triage_mention_use_case.dart';
import '../../domain/entities/feed_mention.dart';
import '../../domain/value_objects/feed_filter.dart';
import '../../domain/value_objects/mention_id.dart';
import '../../domain/value_objects/mention_triage_state.dart';

final class FeedReviewStore extends ChangeNotifier {
  FeedReviewStore({
    required ListFeedMentionsUseCase listMentions,
    required TriageMentionUseCase triageMention,
    required WorkspaceScope scope,
    OperationGenerationGuard? generationGuard,
    RealtimeEventOrderGuard? realtimeGuard,
  }) : _listMentions = listMentions,
       _triageMention = triageMention,
       _scope = scope,
       _generationGuard = generationGuard ?? OperationGenerationGuard(),
       _realtimeGuard = realtimeGuard ?? RealtimeEventOrderGuard(scope: scope);

  final ListFeedMentionsUseCase _listMentions;
  final TriageMentionUseCase _triageMention;
  final OperationGenerationGuard _generationGuard;
  final RealtimeEventOrderGuard _realtimeGuard;

  WorkspaceScope _scope;
  FeedFilter _filter = const FeedFilter(
    triageState: MentionTriageState.needsTriage,
  );
  MentionId? _selectedMentionId;
  String? _nextCursor;

  AsyncViewState<PageResult<FeedMention>> state =
      const InitialViewState<PageResult<FeedMention>>();
  AsyncViewState<FeedMention> triageState =
      const InitialViewState<FeedMention>();
  RealtimeApplyDecision? lastRealtimeDecision;

  WorkspaceScope get scope => _scope;

  FeedFilter get filter => _filter;

  String? get nextCursor => _nextCursor;

  bool get hasExplicitSelection => _selectedMentionId != null;

  FeedMention? get selectedMention {
    final current = state;
    if (current is! ReadyViewState<PageResult<FeedMention>>) {
      return null;
    }
    for (final mention in current.value.items) {
      if (mention.id == _selectedMentionId) {
        return mention;
      }
    }
    return current.value.items.firstOrNull;
  }

  UserActionIntent triageIntentFor(FeedMention mention) {
    return UserActionIntent(
      id: 'feed.triage.reviewed',
      idempotencyKey: '${_scope.workspaceId}:${mention.id.value}:reviewed',
    );
  }

  void updateScope(WorkspaceScope nextScope) {
    if (nextScope == _scope) {
      return;
    }
    _scope = nextScope;
    _generationGuard.invalidate();
    _realtimeGuard.replaceScope(nextScope);
    _nextCursor = null;
    _selectedMentionId = null;
    state = const InitialViewState<PageResult<FeedMention>>();
    triageState = const InitialViewState<FeedMention>();
    notifyListeners();
  }

  void selectMention(MentionId mentionId) {
    _selectedMentionId = mentionId;
    notifyListeners();
  }

  void clearSelection() {
    if (_selectedMentionId == null) {
      return;
    }
    _selectedMentionId = null;
    notifyListeners();
  }

  bool selectMentionById(MentionId mentionId) {
    final current = state;
    if (current is! ReadyViewState<PageResult<FeedMention>>) {
      return false;
    }
    final exists = current.value.items.any(
      (mention) => mention.id == mentionId,
    );
    if (!exists) {
      return false;
    }
    selectMention(mentionId);
    return true;
  }

  Future<void> updateSearch(String value) async {
    _filter = FeedFilter(search: value, triageState: _filter.triageState);
    await refresh();
  }

  Future<void> updateTriageFilter(MentionTriageState? value) async {
    _filter = FeedFilter(search: _filter.search, triageState: value);
    await refresh();
  }

  Future<void> refresh() async {
    _nextCursor = null;
    await _loadPage(append: false);
  }

  Future<void> loadMore() async {
    if (_nextCursor == null) {
      return;
    }
    await _loadPage(append: true);
  }

  Future<void> markReviewed(FeedMention mention) async {
    final result = await _triageMention(
      TriageMentionCommand(
        scope: _scope,
        mentionId: mention.id,
        nextState: MentionTriageState.reviewed,
      ),
    );
    triageState = result.fold(
      onSuccess: ReadyViewState<FeedMention>.new,
      onFailure: (failure) => FailureViewState<FeedMention>(failure: failure),
    );
    await refresh();
  }

  RealtimeApplyDecision mergeRealtime(
    RealtimeEventEnvelope<FeedMention> envelope,
  ) {
    final decision = _realtimeGuard.decisionFor(envelope);
    lastRealtimeDecision = decision;
    if (decision != RealtimeApplyDecision.apply) {
      notifyListeners();
      return decision;
    }
    _realtimeGuard.markApplied(envelope);
    final current = state;
    if (current is ReadyViewState<PageResult<FeedMention>>) {
      final existing = current.value.items
          .where((mention) => mention.id != envelope.payload.id)
          .toList(growable: false);
      state = ReadyViewState<PageResult<FeedMention>>(
        PageResult<FeedMention>(
          items: [envelope.payload, ...existing],
          request: current.value.request,
          nextCursor: current.value.nextCursor,
        ),
      );
    }
    notifyListeners();
    return decision;
  }

  Future<void> _loadPage({required bool append}) async {
    final generation = _generationGuard.markOperationStarted();
    final previous = switch (state) {
      ReadyViewState<PageResult<FeedMention>>(:final value) => value,
      LoadingViewState<PageResult<FeedMention>>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    state = LoadingViewState<PageResult<FeedMention>>(previousValue: previous);
    notifyListeners();

    final result = await _listMentions(
      ListFeedMentionsQuery(
        scope: _scope,
        page: PageRequest(cursor: append ? _nextCursor : null, limit: 2),
        filter: _filter,
      ),
    );
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }

    state = result.fold(
      onSuccess: (page) {
        _nextCursor = page.nextCursor;
        final items = append
            ? _appendDedup(previous?.items ?? const <FeedMention>[], page.items)
            : page.items;
        if (items.isEmpty) {
          return const EmptyViewState<PageResult<FeedMention>>(
            reason: 'feed.empty',
          );
        }
        _clearSelectionIfMissing(items);
        return ReadyViewState<PageResult<FeedMention>>(
          PageResult<FeedMention>(
            items: items,
            request: page.request,
            nextCursor: page.nextCursor,
            isPartial: page.isPartial,
          ),
        );
      },
      onFailure: (failure) =>
          FailureViewState<PageResult<FeedMention>>(failure: failure),
    );
    notifyListeners();
  }

  List<FeedMention> _appendDedup(
    List<FeedMention> previous,
    List<FeedMention> next,
  ) {
    final byId = <MentionId, FeedMention>{
      for (final mention in previous) mention.id: mention,
    };
    for (final mention in next) {
      byId[mention.id] = mention;
    }
    return byId.values.toList(growable: false);
  }

  void _clearSelectionIfMissing(List<FeedMention> items) {
    final selectedId = _selectedMentionId;
    if (selectedId == null) {
      return;
    }
    final exists = items.any((mention) => mention.id == selectedId);
    if (!exists) {
      _selectedMentionId = null;
    }
  }
}
