import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_interests/src/application/commands/archive_interest_command.dart';
import 'package:social_monitor_interests/src/application/commands/create_interest_command.dart';
import 'package:social_monitor_interests/src/application/commands/update_interest_command.dart';
import 'package:social_monitor_interests/src/application/contracts/interest_catalog.dart';
import 'package:social_monitor_interests/src/application/queries/list_interests_query.dart';
import 'package:social_monitor_interests/src/application/use_cases/archive_interest_use_case.dart';
import 'package:social_monitor_interests/src/application/use_cases/create_interest_use_case.dart';
import 'package:social_monitor_interests/src/application/use_cases/update_interest_use_case.dart';
import 'package:social_monitor_interests/src/domain/entities/interest_summary.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_id.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_name.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_query.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/interests_test_fixtures.dart';

void main() {
  test(
    'create interest validates expected failures before repository call',
    () async {
      final catalog = _MutationCatalog();
      final useCase = CreateInterestUseCase(catalog);

      final result = await useCase(
        const CreateInterestCommand(
          scope: testWorkspaceScope,
          name: InterestName('A'),
          query: InterestQuery('market risk'),
          idempotencyKey: 'interest-create-1',
        ),
      );

      expect(result, isA<ResultFailure<InterestSummary>>());
      expect(catalog.createCalls, 0);
    },
  );

  test('create update and archive call catalog on valid commands', () async {
    final catalog = _MutationCatalog();

    await CreateInterestUseCase(catalog)(
      const CreateInterestCommand(
        scope: testWorkspaceScope,
        name: InterestName('Market risk'),
        query: InterestQuery('market risk'),
        idempotencyKey: 'interest-create-1',
      ),
    );
    await UpdateInterestUseCase(catalog)(
      const UpdateInterestCommand(
        scope: testWorkspaceScope,
        interestId: InterestId('interest-market-risk'),
        name: InterestName('Market risk updated'),
        query: InterestQuery('market risk OR pricing'),
      ),
    );
    await ArchiveInterestUseCase(catalog)(
      const ArchiveInterestCommand(
        scope: testWorkspaceScope,
        interestId: InterestId('interest-market-risk'),
      ),
    );

    expect(catalog.createCalls, 1);
    expect(catalog.updateCalls, 1);
    expect(catalog.archiveCalls, 1);
  });
}

final class _MutationCatalog implements InterestCatalog {
  var createCalls = 0;
  var updateCalls = 0;
  var archiveCalls = 0;

  @override
  Future<Result<InterestSummary>> archiveInterest(
    ArchiveInterestCommand command,
  ) async {
    archiveCalls += 1;
    return Result.success(interestSummary());
  }

  @override
  Future<Result<InterestSummary>> createInterest(
    CreateInterestCommand command,
  ) async {
    createCalls += 1;
    return Result.success(interestSummary());
  }

  @override
  Future<Result<PageResult<InterestSummary>>> listInterests(
    ListInterestsQuery query,
  ) async {
    return Result.success(interestSummaryPage([interestSummary()]));
  }

  @override
  Future<Result<InterestSummary>> updateInterest(
    UpdateInterestCommand command,
  ) async {
    updateCalls += 1;
    return Result.success(interestSummary());
  }
}
