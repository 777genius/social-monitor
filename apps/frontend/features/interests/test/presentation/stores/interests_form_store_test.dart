import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_interests/src/application/use_cases/archive_interest_use_case.dart';
import 'package:social_monitor_interests/src/application/use_cases/create_interest_use_case.dart';
import 'package:social_monitor_interests/src/application/use_cases/update_interest_use_case.dart';
import 'package:social_monitor_interests/src/domain/entities/interest_summary.dart';
import 'package:social_monitor_interests/src/infrastructure/api_clients/in_memory_interests_api_client.dart';
import 'package:social_monitor_interests/src/infrastructure/repositories/generated_interest_catalog.dart';
import 'package:social_monitor_interests/src/presentation/stores/interests_form_store.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/interests_test_fixtures.dart';

void main() {
  test('validates create form before saving', () async {
    final store = _formStore();

    store.beginCreate();
    store.updateName('A');
    store.updateQueryText('market risk');
    final result = await store.save();

    expect(result, isA<ResultFailure<InterestSummary>>());
    expect(store.state, isA<FailureViewState<InterestSummary>>());
  });

  test('creates updates and archives through use cases', () async {
    final store = _formStore();

    store.beginCreate();
    store.updateName('Market risk');
    store.updateQueryText('market risk OR pricing');
    final created = await store.save();

    expect(created, isA<ResultSuccess<InterestSummary>>());

    final interest = (created as ResultSuccess<InterestSummary>).value;
    store.beginEdit(interest);
    store.updateName('Market risk updated');
    store.updateQueryText('market risk');
    final updated = await store.save();

    expect(updated, isA<ResultSuccess<InterestSummary>>());
    final archived = await store.archive(interest);
    expect(archived, isA<ResultSuccess<InterestSummary>>());
  });
}

InterestsFormStore _formStore() {
  final catalog = GeneratedInterestCatalog(
    apiClient: InMemoryInterestsApiClient(items: [interestSummaryApiDto()]),
  );
  return InterestsFormStore(
    createInterest: CreateInterestUseCase(catalog),
    updateInterest: UpdateInterestUseCase(catalog),
    archiveInterest: ArchiveInterestUseCase(catalog),
    scope: testWorkspaceScope,
  );
}
