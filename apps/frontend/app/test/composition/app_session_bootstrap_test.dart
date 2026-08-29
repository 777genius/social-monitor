import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_app/src/composition/app_frontend_runtime_config.dart';
import 'package:social_monitor_app/src/composition/app_runtime.dart';
import 'package:social_monitor_app/src/composition/app_session_bootstrap.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';

void main() {
  test(
    'restores session and summary seed with one bootstrap request',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final paths = <String>[];
      server.listen((request) async {
        paths.add(request.uri.path);
        request.response.headers.contentType = ContentType.json;
        request.response.write(jsonEncode(_bootstrapResponse));
        await request.response.close();
      });
      final runtime = AppFrontendRuntimeConfig(
        apiBaseUrl: 'http://${server.address.host}:${server.port}',
        correlationId: 'bootstrap-test',
      ).createRuntimeOrNull()!;
      final controller = AppRuntimeController(runtime);

      await bootstrapAppSession(controller);

      expect(paths, ['/app/bootstrap']);
      expect(controller.runtime.session.userId, 'guest-1');
      expect(controller.runtime.session.isRestoring, isFalse);
      final scope = controller.runtime.workspace.scope!;
      expect(
        controller.takeInitialSummaryBootstrap(scope),
        isA<ReaderSummaryBootstrapResponseDto>(),
      );
      expect(controller.takeInitialSummaryBootstrap(scope), isNull);

      (runtime.generatedApiRuntime! as GeneratedApiRuntime).close(force: true);
      await server.close(force: true);
    },
  );

  test('falls back to session discovery during a split rollout', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final paths = <String>[];
    server.listen((request) async {
      paths.add(request.uri.path);
      request.response.headers.contentType = ContentType.json;
      if (request.uri.path == '/app/bootstrap') {
        request.response.statusCode = HttpStatus.notFound;
        request.response.write(jsonEncode({'statusCode': HttpStatus.notFound}));
      } else {
        request.response.write(jsonEncode(_sessionResponse));
      }
      await request.response.close();
    });
    final runtime = AppFrontendRuntimeConfig(
      apiBaseUrl: 'http://${server.address.host}:${server.port}',
      correlationId: 'bootstrap-fallback-test',
    ).createRuntimeOrNull()!;
    final controller = AppRuntimeController(runtime);

    await bootstrapAppSession(controller);

    expect(paths, ['/app/bootstrap', '/auth/session']);
    expect(controller.runtime.session.userId, 'guest-1');
    expect(
      controller.takeInitialSummaryBootstrap(
        controller.runtime.workspace.scope!,
      ),
      isNull,
    );

    (runtime.generatedApiRuntime! as GeneratedApiRuntime).close(force: true);
    await server.close(force: true);
  });
}

const _workspace = {
  'tenantId': 'tenant-1',
  'workspaceId': 'workspace-1',
  'tenantName': 'Public',
  'workspaceName': 'Daily stories',
  'workspaceRole': 'viewer',
  'statusLabel': 'Active',
};

const _bootstrapResponse = {
  'session': _sessionResponse,
  'readerSummaries': {
    'tenantId': 'tenant-1',
    'workspaceId': 'workspace-1',
    'latest': {'items': <Object>[]},
    'periods': {'items': <Object>[]},
  },
};

const _sessionResponse = {
  'userId': 'guest-1',
  'userLabel': 'Guest',
  'userRole': 'user',
  'selectedWorkspace': _workspace,
  'workspaces': [_workspace],
};
