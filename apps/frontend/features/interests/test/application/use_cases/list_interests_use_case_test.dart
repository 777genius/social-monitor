import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_interests/src/application/commands/archive_interest_command.dart';
import 'package:social_monitor_interests/src/application/commands/create_interest_command.dart';
import 'package:social_monitor_interests/src/application/commands/update_interest_command.dart';
import 'package:social_monitor_interests/src/application/contracts/interest_catalog.dart';
import 'package:social_monitor_interests/src/application/queries/list_interests_query.dart';
import 'package:social_monitor_interests/src/application/use_cases/list_interests_use_case.dart';
import 'package:social_monitor_interests/src/domain/entities/interest_summary.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/interests_test_fixtures.dart';

void main() {
  test('returns a paged interest list through Result', () async {
    final useCase = ListInterestsUseCase(
      _FakeInterestCatalog(
        Result.success(interestSummaryPage([interestSummary()])),
      ),
    );

    final result = await useCase(
      const ListInterestsQuery(scope: testWorkspaceScope),
    );

    expect(result, isA<ResultSuccess<PageResult<InterestSummary>>>());
    final page = (result as ResultSuccess<PageResult<InterestSummary>>).value;
    expect(page.items.single.name.value, 'Market risk');
  });

  test('rejects missing workspace scope before infrastructure call', () async {
    final catalog = _FakeInterestCatalog(
      Result.success(interestSummaryPage([interestSummary()])),
    );
    final useCase = ListInterestsUseCase(catalog);

    final result = await useCase(
      const ListInterestsQuery(
        scope: WorkspaceScope(tenantId: '', workspaceId: ''),
      ),
    );

    expect(result, isA<ResultFailure<PageResult<InterestSummary>>>());
    expect(catalog.calls, 0);
  });
}

final class _FakeInterestCatalog implements InterestCatalog {
  _FakeInterestCatalog(this._result);

  final Result<PageResult<InterestSummary>> _result;
  int calls = 0;

  @override
  Future<Result<PageResult<InterestSummary>>> listInterests(
    ListInterestsQuery query,
  ) async {
    calls += 1;
    return _result;
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
