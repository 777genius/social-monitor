import 'package:dio/dio.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import 'api_problem.dart';
import 'generated_api_client.dart';
import 'generated_api_exception.dart';

final class DioGeneratedApiClient implements GeneratedApiClient {
  const DioGeneratedApiClient();

  @override
  Future<Result<T>> send<T extends Object>(
    WorkspaceRequest request,
    Future<T> Function() operation,
  ) async {
    if (!request.scope.isValid) {
      return const Result.failure(
        ValidationFailure(
          message: 'Workspace scope is required before calling the API',
          code: 'missing_workspace_scope',
        ),
      );
    }

    return sendUnscoped(operation);
  }

  @override
  Future<Result<T>> sendUnscoped<T extends Object>(
    Future<T> Function() operation,
  ) async {
    try {
      return Result.success(await operation());
    } on GeneratedApiException catch (error) {
      return Result.failure(error.problem.toFailure());
    } on DioException catch (error) {
      return Result.failure(_failureFromDioException(error));
    } on Object catch (error) {
      return Result.failure(
        UnexpectedFailure(
          message: 'Unexpected API client failure',
          code: 'generated_api_unexpected_failure',
          cause: error,
        ),
      );
    }
  }

  AppFailure _failureFromDioException(DioException error) {
    final response = error.response;
    if (response != null) {
      return ApiProblem.fromResponse(
        statusCode: response.statusCode,
        data: response.data,
      ).toFailure();
    }

    return NetworkFailure(
      message: error.message ?? 'Network request failed',
      code: _networkFailureCode(error.type),
      cause: error,
    );
  }

  String _networkFailureCode(DioExceptionType type) {
    return switch (type) {
      DioExceptionType.connectionTimeout => 'connection_timeout',
      DioExceptionType.sendTimeout => 'send_timeout',
      DioExceptionType.receiveTimeout => 'receive_timeout',
      DioExceptionType.connectionError => 'connection_error',
      DioExceptionType.cancel => 'request_cancelled',
      DioExceptionType.badCertificate => 'bad_certificate',
      DioExceptionType.badResponse => 'bad_response_without_body',
      DioExceptionType.unknown => 'network_unknown',
    };
  }
}
