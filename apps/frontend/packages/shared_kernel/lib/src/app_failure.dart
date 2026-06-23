sealed class AppFailure {
  const AppFailure({required this.message, this.code, this.cause});

  final String message;
  final String? code;
  final Object? cause;
}

final class NetworkFailure extends AppFailure {
  const NetworkFailure({required super.message, super.code, super.cause});
}

final class UnauthorizedFailure extends AppFailure {
  const UnauthorizedFailure({required super.message, super.code, super.cause});
}

final class ForbiddenFailure extends AppFailure {
  const ForbiddenFailure({required super.message, super.code, super.cause});
}

final class NotFoundFailure extends AppFailure {
  const NotFoundFailure({required super.message, super.code, super.cause});
}

final class ServerFailure extends AppFailure {
  const ServerFailure({required super.message, super.code, super.cause});
}

final class ValidationFailure extends AppFailure {
  const ValidationFailure({
    required super.message,
    this.field,
    super.code,
    super.cause,
  });

  final String? field;
}

final class StaleWorkspaceFailure extends AppFailure {
  const StaleWorkspaceFailure({
    required super.message,
    super.code,
    super.cause,
  });
}

final class StaleOperationFailure extends AppFailure {
  const StaleOperationFailure({
    required super.message,
    super.code,
    super.cause,
  });
}

final class UnexpectedFailure extends AppFailure {
  const UnexpectedFailure({required super.message, super.code, super.cause});
}
