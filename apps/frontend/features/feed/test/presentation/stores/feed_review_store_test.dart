import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_feed/src/application/commands/triage_mention_command.dart';
import 'package:social_monitor_feed/src/application/contracts/feed_review_catalog.dart';
import 'package:social_monitor_feed/src/application/queries/list_feed_mentions_query.dart';
import 'package:social_monitor_feed/src/application/use_cases/list_feed_mentions_use_case.dart';
import 'package:social_monitor_feed/src/application/use_cases/triage_mention_use_case.dart';
import 'package:social_monitor_feed/src/domain/entities/feed_mention.dart';
import 'package:social_monitor_feed/src/domain/value_objects/mention_id.dart';
import 'package:social_monitor_feed/src/infrastructure/api/feed_mention_api_dto.dart';
import 'package:social_monitor_feed/src/infrastructure/api_clients/in_memory_feed_api_client.dart';
import 'package:social_monitor_feed/src/infrastructure/repositories/generated_feed_review_catalog.dart';
import 'package:social_monitor_feed/src/presentation/stores/feed_review_store.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/feed_test_fixtures.dart';

void main() {
  test('paginates appends and deduplicates mentions', () async {
    final store = _store([
      feedMentionApiDto(id: 'm-1'),
      feedMentionApiDto(id: 'm-2', title: 'Positive launch mention'),
      feedMentionApiDto(id: 'm-2', title: 'Positive launch mention updated'),
      feedMentionApiDto(id: 'm-3', title: 'Integration request'),
    ]);

    await store.refresh();
    await store.loadMore();

    final state = store.state as ReadyViewState<PageResult<FeedMention>>;
    expect(state.value.items.map((mention) => mention.id.value), [
      'm-1',
      'm-2',
      'm-3',
    ]);
    expect(state.value.items[1].title, 'Positive launch mention updated');
  });

  test('filter change discards late list result', () async {
    final catalog = _DeferredFeedReviewCatalog();
    final store = FeedReviewStore(
      listMentions: ListFeedMentionsUseCase(catalog),
      triageMention: TriageMentionUseCase(catalog),
      scope: feedWorkspaceScope,
    );

    final first = store.updateSearch('first');
    final second = store.updateSearch('second');
    expect(catalog.pending, hasLength(2));

    catalog.pending[1].completeWith([
      feedMention(id: 'm-second', title: 'Second result'),
    ]);
    await second;

    catalog.pending[0].completeWith([
      feedMention(id: 'm-first', title: 'First result'),
    ]);
    await first;

    final state = store.state as ReadyViewState<PageResult<FeedMention>>;
    expect(state.value.items.single.title, 'Second result');
  });

  test('workspace switch clears feed state and selection', () async {
    final store = _store([feedMentionApiDto()]);

    await store.refresh();
    store.selectMention(const MentionId('m-1'));

    store.updateScope(
      const WorkspaceScope(tenantId: 'tenant-demo', workspaceId: 'next'),
    );

    expect(store.state, isA<InitialViewState<PageResult<FeedMention>>>());
    expect(store.selectedMention, isNull);
    expect(store.hasExplicitSelection, isFalse);
    expect(store.nextCursor, isNull);
  });

  test('invalid detail id does not change selection', () async {
    final store = _store([feedMentionApiDto()]);

    await store.refresh();

    expect(store.selectMentionById(const MentionId('missing')), isFalse);
    expect(store.hasExplicitSelection, isFalse);
  });

  test(
    'realtime merge applies unique events and rejects duplicates gaps stale',
    () async {
      final store = _store([feedMentionApiDto()]);
      await store.refresh();

      final mention = feedMention(id: 'm-realtime', title: 'Realtime mention');
      final first = _envelope(
        eventId: 'event-1',
        sequence: 1,
        payload: mention,
      );

      expect(store.mergeRealtime(first), RealtimeApplyDecision.apply);
      final state = store.state as ReadyViewState<PageResult<FeedMention>>;
      expect(state.value.items.first.id.value, 'm-realtime');

      expect(store.mergeRealtime(first), RealtimeApplyDecision.duplicate);
      expect(
        store.mergeRealtime(
          _envelope(eventId: 'event-stale', sequence: 1, payload: mention),
        ),
        RealtimeApplyDecision.stale,
      );
      expect(
        store.mergeRealtime(
          _envelope(eventId: 'event-gap', sequence: 3, payload: mention),
        ),
        RealtimeApplyDecision.resyncRequired,
      );
    },
  );

  test('workspace switch resets realtime ordering guard', () async {
    final store = _store([feedMentionApiDto()]);
    await store.refresh();

    expect(
      store.mergeRealtime(
        _envelope(
          eventId: 'event-1',
          sequence: 1,
          payload: feedMention(id: 'm-old', title: 'Old workspace mention'),
        ),
      ),
      RealtimeApplyDecision.apply,
    );

    const nextScope = WorkspaceScope(
      tenantId: 'tenant-demo',
      workspaceId: 'workspace-next',
    );
    store.updateScope(nextScope);
    store.state = ReadyViewState<PageResult<FeedMention>>(
      feedMentionPage([feedMention(id: 'm-next', title: 'Next workspace')]),
    );

    expect(
      store.mergeRealtime(
        _envelope(
          eventId: 'event-2',
          sequence: 1,
          payload: feedMention(id: 'm-next-live', title: 'Next live mention'),
          scope: nextScope,
        ),
      ),
      RealtimeApplyDecision.apply,
    );
  });
}

FeedReviewStore _store(List<FeedMentionApiDto> items) {
  final catalog = GeneratedFeedReviewCatalog(
    apiClient: InMemoryFeedApiClient(items: items),
  );
  return FeedReviewStore(
    listMentions: ListFeedMentionsUseCase(catalog),
    triageMention: TriageMentionUseCase(catalog),
    scope: feedWorkspaceScope,
  );
}

RealtimeEventEnvelope<FeedMention> _envelope({
  required String eventId,
  required int sequence,
  required FeedMention payload,
  WorkspaceScope scope = feedWorkspaceScope,
}) {
  return RealtimeEventEnvelope<FeedMention>(
    streamId: 'feed',
    eventId: eventId,
    schemaVersion: 1,
    sequence: sequence,
    cursor: const RealtimeCursor('cursor'),
    scope: scope,
    payload: payload,
  );
}

final class _DeferredFeedReviewCatalog implements FeedReviewCatalog {
  final pending = <_PendingListRequest>[];

  @override
  Future<Result<PageResult<FeedMention>>> listMentions(
    ListFeedMentionsQuery query,
  ) {
    final completer = Completer<Result<PageResult<FeedMention>>>();
    pending.add(_PendingListRequest(query: query, completer: completer));
    return completer.future;
  }

  @override
  Future<Result<FeedMention>> triageMention(TriageMentionCommand command) {
    return Future.value(
      Result.success(feedMention(id: command.mentionId.value)),
    );
  }
}

final class _PendingListRequest {
  const _PendingListRequest({required this.query, required this.completer});

  final ListFeedMentionsQuery query;
  final Completer<Result<PageResult<FeedMention>>> completer;

  void completeWith(List<FeedMention> items) {
    completer.complete(
      Result.success(feedMentionPage(items, request: query.page)),
    );
  }
}
