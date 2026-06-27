import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class CreateTopicApiRequestDto {
  const CreateTopicApiRequestDto({
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

final class UpdateTopicApiRequestDto {
  const UpdateTopicApiRequestDto({
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

final class ArchiveTopicApiRequestDto {
  const ArchiveTopicApiRequestDto({required this.scope, required this.id});

  final WorkspaceScope scope;
  final String id;
}
