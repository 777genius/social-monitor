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

  static ApiProblem fromResponse({
    required int? statusCode,
    required Object? data,
  }) {
    if (data case final Map<Object?, Object?> problem) {
      return ApiProblem(
        title: _stringValue(problem['title']) ?? 'Request failed',
        status: _intValue(problem['status']) ?? statusCode ?? 500,
        detail: _stringValue(problem['detail']),
        type: _stringValue(problem['type']),
        instance: _stringValue(problem['instance']),
      );
    }

    return ApiProblem(
      title: 'Request failed',
      status: statusCode ?? 500,
      detail: data is String && data.trim().isNotEmpty ? data : null,
    );
  }

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

String? _stringValue(Object? value) {
  return value is String && value.trim().isNotEmpty ? value : null;
}

int? _intValue(Object? value) {
  if (value is int) {
    return value;
  }

  if (value is num) {
    return value.toInt();
  }

  return null;
}
