import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class CreateInterestApiRequestDto {
  const CreateInterestApiRequestDto({
    required this.scope,
    required this.name,
    required this.query,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final String name;
  final String query;
  final String idempotencyKey;
}

final class UpdateInterestApiRequestDto {
  const UpdateInterestApiRequestDto({
    required this.scope,
    required this.id,
    required this.name,
    required this.query,
  });

  final WorkspaceScope scope;
  final String id;
  final String name;
  final String query;
}

final class ArchiveInterestApiRequestDto {
  const ArchiveInterestApiRequestDto({required this.scope, required this.id});

  final WorkspaceScope scope;
  final String id;
}
