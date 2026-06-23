import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class ApiProblem {
  const ApiProblem({
    required this.title,
    required this.status,
    this.detail,
    this.type,
    this.instance,
  });

  final String title;
  final int status;
  final String? detail;
  final String? type;
  final String? instance;

  AppFailure toFailure() {
    final message = detail == null || detail!.isEmpty ? title : detail!;

    return switch (status) {
      401 => UnauthorizedFailure(message: message, code: 'unauthorized'),
      403 => ForbiddenFailure(message: message, code: 'forbidden'),
      404 => NotFoundFailure(message: message, code: 'not_found'),
      >= 500 => ServerFailure(message: message, code: 'server_error'),
      _ => ValidationFailure(message: message, code: 'validation_error'),
    };
  }
}
