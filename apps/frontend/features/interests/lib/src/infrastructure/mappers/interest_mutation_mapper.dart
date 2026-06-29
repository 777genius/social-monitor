import '../../application/commands/archive_interest_command.dart';
import '../../application/commands/create_interest_command.dart';
import '../../application/commands/update_interest_command.dart';
import '../api/interest_mutation_api_dto.dart';

final class InterestMutationMapper {
  const InterestMutationMapper();

  CreateInterestApiRequestDto createRequest(CreateInterestCommand command) {
    return CreateInterestApiRequestDto(
      scope: command.scope,
      name: command.name.normalized,
      query: command.query.normalized,
      idempotencyKey: command.idempotencyKey,
    );
  }

  UpdateInterestApiRequestDto updateRequest(UpdateInterestCommand command) {
    return UpdateInterestApiRequestDto(
      scope: command.scope,
      id: command.interestId.value,
      name: command.name.normalized,
      query: command.query.normalized,
    );
  }

  ArchiveInterestApiRequestDto archiveRequest(ArchiveInterestCommand command) {
    return ArchiveInterestApiRequestDto(
      scope: command.scope,
      id: command.interestId.value,
    );
  }
}
