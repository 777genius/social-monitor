import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_interests/src/application/commands/archive_interest_command.dart';
import 'package:social_monitor_interests/src/application/commands/create_interest_command.dart';
import 'package:social_monitor_interests/src/application/commands/update_interest_command.dart';
import 'package:social_monitor_interests/src/application/contracts/interest_catalog.dart';
import 'package:social_monitor_interests/src/application/queries/list_interests_query.dart';
import 'package:social_monitor_interests/src/application/use_cases/list_interests_use_case.dart';
import 'package:social_monitor_interests/src/domain/entities/interest_summary.dart';
import 'package:social_monitor_interests/src/presentation/stores/interests_list_store.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/interests_test_fixtures.dart';

void main() {
  test('loads interests into typed async state', () async {
    final store = InterestsListStore(
      listInterests: ListInterestsUseCase(
        _QueuedInterestCatalog([
          Result.success(interestSummaryPage([interestSummary()])),
        ]),
      ),
      scope: testWorkspaceScope,
    );

    await store.load();

    expect(store.state, isA<ReadyViewState<PageResult<InterestSummary>>>());
  });

  test('rejects stale results from older load operations', () async {
    final catalog = _CompleterInterestCatalog();
    final store = InterestsListStore(
      listInterests: ListInterestsUseCase(catalog),
      scope: testWorkspaceScope,
    );

    final firstLoad = store.load(search: 'first');
    await Future<void>.delayed(Duration.zero);
    final secondLoad = store.load(search: 'second');
    await Future<void>.delayed(Duration.zero);

    catalog.completeAt(
      1,
      Result.success(
        interestSummaryPage([interestSummary(name: 'Second interest')]),
      ),
    );
    await secondLoad;

    catalog.completeAt(
      0,
      Result.success(
        interestSummaryPage([interestSummary(name: 'First interest')]),
      ),
    );
    await firstLoad;

    final state = store.state as ReadyViewState<PageResult<InterestSummary>>;
    expect(state.value.items.single.name.value, 'Second interest');
  });

  test('exposes typed create and archive action intents', () {
    final store = InterestsListStore(
      listInterests: ListInterestsUseCase(
        _QueuedInterestCatalog([
          Result.success(interestSummaryPage([interestSummary()])),
        ]),
      ),
      scope: testWorkspaceScope,
    );
    final interest = interestSummary();

    expect(store.createInterestIntent.id, 'interests.create');
    expect(store.archiveIntentFor(interest).risk, UserActionRisk.destructive);
    expect(store.archiveIntentFor(interest).requiresConfirmation, isTrue);
    expect(
      store.archiveIntentFor(interest).idempotencyKey,
      'workspace-demo:interest-market-risk:archive',
    );
  });
}

final class _QueuedInterestCatalog implements InterestCatalog {
  _QueuedInterestCatalog(this._results);

  final List<Result<PageResult<InterestSummary>>> _results;
  var _index = 0;

  @override
  Future<Result<PageResult<InterestSummary>>> listInterests(
    ListInterestsQuery query,
  ) async {
    final result = _results[_index];
    _index += 1;
    return result;
  }

  @override
  Future<Result<InterestSummary>> archiveInterest(
    ArchiveInterestCommand command,
  ) async {
    return Result.success(interestSummary());
  }

  @override
  Future<Result<InterestSummary>> createInterest(
    CreateInterestCommand command,
  ) async {
    return Result.success(interestSummary());
  }

  @override
  Future<Result<InterestSummary>> updateInterest(
    UpdateInterestCommand command,
  ) async {
    return Result.success(interestSummary());
  }
}

final class _CompleterInterestCatalog implements InterestCatalog {
  final _completers = <Completer<Result<PageResult<InterestSummary>>>>[];

  @override
  Future<Result<PageResult<InterestSummary>>> listInterests(
    ListInterestsQuery query,
  ) {
    final completer = Completer<Result<PageResult<InterestSummary>>>();
    _completers.add(completer);
    return completer.future;
  }

  @override
  Future<Result<InterestSummary>> archiveInterest(
    ArchiveInterestCommand command,
  ) async {
    return Result.success(interestSummary());
  }

  @override
  Future<Result<InterestSummary>> createInterest(
    CreateInterestCommand command,
  ) async {
    return Result.success(interestSummary());
  }

  @override
  Future<Result<InterestSummary>> updateInterest(
    UpdateInterestCommand command,
  ) async {
    return Result.success(interestSummary());
  }

  void completeAt(int index, Result<PageResult<InterestSummary>> result) {
    _completers[index].complete(result);
  }
}
