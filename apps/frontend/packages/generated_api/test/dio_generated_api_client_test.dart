import 'package:dio/dio.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_generated_api/src/dio_generated_api_client.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:test/test.dart';

void main() {
  const client = DioGeneratedApiClient();
  const validRequest = WorkspaceRequest(
    scope: WorkspaceScope(tenantId: 'tenant-1', workspaceId: 'workspace-1'),
  );

  test('returns success values from the operation', () async {
    final result = await client.send<String>(
      validRequest,
      () async => 'loaded',
    );

    expect(result, isA<ResultSuccess<String>>());
    expect((result as ResultSuccess<String>).value, 'loaded');
  });

  test('fails closed when workspace scope is missing', () async {
    var operationCalled = false;

    final result = await client.send<String>(
      const WorkspaceRequest(
        scope: WorkspaceScope(tenantId: '', workspaceId: 'workspace-1'),
      ),
      () async {
        operationCalled = true;
        return 'loaded';
      },
    );

    expect(operationCalled, isFalse);
    final failure = (result as ResultFailure<String>).failure;
    expect(failure, isA<ValidationFailure>());
    expect(failure.code, 'missing_workspace_scope');
  });

  test('maps dio problem details responses to typed failures', () async {
    final requestOptions = RequestOptions(path: '/topics');

    final result = await client.send<String>(validRequest, () async {
      throw DioException(
        requestOptions: requestOptions,
        response: Response<Object?>(
          requestOptions: requestOptions,
          statusCode: 403,
          data: {
            'title': 'Forbidden',
            'status': 403,
            'detail': 'Workspace access denied',
          },
        ),
        type: DioExceptionType.badResponse,
      );
    });

    final failure = (result as ResultFailure<String>).failure;
    expect(failure, isA<ForbiddenFailure>());
    expect(failure.message, 'Workspace access denied');
    expect(failure.code, 'forbidden');
  });

  test('maps dio transport failures to network failures', () async {
    final requestOptions = RequestOptions(path: '/topics');

    final result = await client.send<String>(validRequest, () async {
      throw DioException(
        requestOptions: requestOptions,
        type: DioExceptionType.connectionTimeout,
        message: 'connection timed out',
      );
    });

    final failure = (result as ResultFailure<String>).failure;
    expect(failure, isA<NetworkFailure>());
    expect(failure.message, 'connection timed out');
    expect(failure.code, 'connection_timeout');
  });
}
