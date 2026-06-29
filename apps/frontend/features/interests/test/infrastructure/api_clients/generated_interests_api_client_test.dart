import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_interests/src/infrastructure/api/interest_mutation_api_dto.dart';
import 'package:social_monitor_interests/src/infrastructure/api_clients/generated_interests_api_client.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

void main() {
  test('rejects non generated api runtime objects', () {
    expect(
      () => GeneratedInterestsApiClient.fromRuntime(runtime: Object()),
      throwsArgumentError,
    );
  });

  test('validates workspace scope before interest mutations', () async {
    final runtime = createGeneratedApiRuntime(
      const GeneratedApiConfiguration(baseUrl: 'https://example.invalid'),
    );
    addTearDown(runtime.close);
    final client = GeneratedInterestsApiClient.fromRuntime(runtime: runtime);
    const missingScope = WorkspaceScope(tenantId: '', workspaceId: '');

    final update = await client.updateInterest(
      const UpdateInterestApiRequestDto(
        scope: missingScope,
        id: 'interest-pricing',
        name: 'Competitor pricing',
        query: 'pricing',
      ),
    );
    final archive = await client.archiveInterest(
      const ArchiveInterestApiRequestDto(
        scope: missingScope,
        id: 'interest-pricing',
      ),
    );

    expect(update, isA<ResultFailure>());
    expect((update as ResultFailure).failure.code, 'missing_workspace_scope');
    expect(archive, isA<ResultFailure>());
    expect((archive as ResultFailure).failure.code, 'missing_workspace_scope');
  });
}
