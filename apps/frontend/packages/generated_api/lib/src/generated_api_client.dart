import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

abstract interface class GeneratedApiClient {
  Future<Result<T>> send<T extends Object>(
    WorkspaceRequest request,
    Future<T> Function() operation,
  );

  Future<Result<T>> sendUnscoped<T extends Object>(
    Future<T> Function() operation,
  );
}

final class WorkspaceRequest {
  const WorkspaceRequest({required this.scope});

  final WorkspaceScope scope;
}
