import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:test/test.dart';

void main() {
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
