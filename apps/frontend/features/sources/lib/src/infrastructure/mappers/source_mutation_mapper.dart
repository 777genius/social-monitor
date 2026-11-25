import '../../application/commands/connect_source_command.dart';
import '../api/source_mutation_api_dto.dart';

final class SourceMutationMapper {
  const SourceMutationMapper();

  ConnectSourceApiRequestDto connectRequest(ConnectSourceCommand command) {
    return ConnectSourceApiRequestDto(
      providerKey: command.providerKey.trim(),
      displayName: command.displayName.trim(),
    );
  }
}
