import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_interests/src/infrastructure/api/interest_mutation_api_dto.dart';
import 'package:social_monitor_interests/src/infrastructure/mappers/generated_interest_rest_mapper.dart';

import '../../support/interests_test_fixtures.dart';

void main() {
  test('maps generated interest list DTOs into feature API DTOs', () {
    const mapper = GeneratedInterestRestMapper();

    final response = mapper.listInterests(
      generated.ListInterestsResponseDto(
        interests: [
          generated.InterestResponseDto(
            id: 'interest-pricing',
            tenantId: 'tenant-demo',
            workspaceId: 'workspace-demo',
            name: 'Competitor pricing',
            query: 'pricing OR plan change',
            status: generated.InterestResponseDtoStatusStatus.active,
            createdAt: DateTime.utc(2026, 6, 23),
          ),
        ],
        nextCursor: 'cursor-2',
      ),
    );

    expect(response.nextCursor, 'cursor-2');
    expect(response.items.single.id, 'interest-pricing');
    expect(response.items.single.name, 'Competitor pricing');
    expect(response.items.single.query, 'pricing OR plan change');
  });

  test('maps create request and optimistic create response', () {
    const mapper = GeneratedInterestRestMapper();
    const request = CreateInterestApiRequestDto(
      scope: testWorkspaceScope,
      name: 'Competitor launches',
      query: 'launch OR beta',
      idempotencyKey: 'interest-create-1',
    );

    final generatedRequest = mapper.createInterest(request);
    final created = mapper.createdInterest(
      const generated.CreateInterestResponseDto(
        interestId: 'interest-created',
        created: true,
      ),
      request,
    );

    expect(generatedRequest.name, 'Competitor launches');
    expect(generatedRequest.query, 'launch OR beta');
    expect(created.id, 'interest-created');
    expect(created.query, 'launch OR beta');
  });

  test('maps update request DTOs', () {
    const mapper = GeneratedInterestRestMapper();
    const request = UpdateInterestApiRequestDto(
      scope: testWorkspaceScope,
      id: 'interest-pricing',
      name: 'Competitor pricing',
      query: 'pricing OR plan',
    );

    final generatedRequest = mapper.updateInterest(request);

    expect(generatedRequest.name, 'Competitor pricing');
    expect(generatedRequest.query, 'pricing OR plan');
  });
}
