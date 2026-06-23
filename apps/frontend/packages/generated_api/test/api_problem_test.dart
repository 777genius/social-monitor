import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:test/test.dart';

void main() {
  test('parses problem details response payloads', () {
    final problem = ApiProblem.fromResponse(
      statusCode: 400,
      data: {
        'title': 'Invalid request',
        'status': 422,
        'detail': 'Topic name is required',
        'type': 'https://social-monitor.local/problems/validation',
        'instance': '/topics',
      },
    );

    expect(problem.title, 'Invalid request');
    expect(problem.status, 422);
    expect(problem.detail, 'Topic name is required');
    expect(problem.type, 'https://social-monitor.local/problems/validation');
    expect(problem.instance, '/topics');
  });

  test('uses a safe fallback for non problem details payloads', () {
    final problem = ApiProblem.fromResponse(
      statusCode: 503,
      data: 'temporary outage',
    );

    expect(problem.title, 'Request failed');
    expect(problem.status, 503);
    expect(problem.detail, 'temporary outage');
    expect(problem.toFailure(), isA<ServerFailure>());
  });

  test('maps problem details to app failures', () {
    final failure = const ApiProblem(
      title: 'Forbidden',
      status: 403,
      detail: 'Workspace access denied',
    ).toFailure();

    expect(failure, isA<ForbiddenFailure>());
    expect(failure.message, 'Workspace access denied');
  });
}
