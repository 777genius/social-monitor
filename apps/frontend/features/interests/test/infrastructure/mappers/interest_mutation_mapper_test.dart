import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_interests/src/application/commands/archive_interest_command.dart';
import 'package:social_monitor_interests/src/application/commands/create_interest_command.dart';
import 'package:social_monitor_interests/src/application/commands/update_interest_command.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_id.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_name.dart';
import 'package:social_monitor_interests/src/domain/value_objects/interest_query.dart';
import 'package:social_monitor_interests/src/infrastructure/mappers/interest_mutation_mapper.dart';

import '../../support/interests_test_fixtures.dart';

void main() {
  test('maps create update and archive commands to endpoint DTOs', () {
    const mapper = InterestMutationMapper();

    final create = mapper.createRequest(
      const CreateInterestCommand(
        scope: testWorkspaceScope,
        name: InterestName(' Market risk '),
        query: InterestQuery(' risk OR pricing '),
        idempotencyKey: 'interest-create-1',
      ),
    );
    final update = mapper.updateRequest(
      const UpdateInterestCommand(
        scope: testWorkspaceScope,
        interestId: InterestId('interest-market-risk'),
        name: InterestName('Market risk updated'),
        query: InterestQuery('risk'),
      ),
    );
    final archive = mapper.archiveRequest(
      const ArchiveInterestCommand(
        scope: testWorkspaceScope,
        interestId: InterestId('interest-market-risk'),
      ),
    );

    expect(create.name, 'Market risk');
    expect(create.query, 'risk OR pricing');
    expect(create.idempotencyKey, 'interest-create-1');
    expect(create.scope, testWorkspaceScope);
    expect(update.id, 'interest-market-risk');
    expect(update.query, 'risk');
    expect(archive.id, 'interest-market-risk');
    expect(archive.scope, testWorkspaceScope);
  });
}
