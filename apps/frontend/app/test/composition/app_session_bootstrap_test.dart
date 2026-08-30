import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_app/src/composition/app_frontend_runtime_config.dart';
import 'package:social_monitor_app/src/composition/app_runtime.dart';
import 'package:social_monitor_app/src/composition/app_session_bootstrap.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';

void main() {
  test(
    'consumes the HTML-prefetched bootstrap without an API duplicate',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final paths = <String>[];
      server.listen((request) async {
        paths.add(request.uri.path);
        request.response.statusCode = HttpStatus.internalServerError;
        await request.response.close();
      });
      final runtime = AppFrontendRuntimeConfig(
        apiBaseUrl: 'http://${server.address.host}:${server.port}',
        correlationId: 'early-bootstrap-test',
      ).createRuntimeOrNull()!;
      final controller = AppRuntimeController(runtime);
      var bridgeCalls = 0;

      await bootstrapAppSession(
        controller,
        earlyBootstrapReader: () async {
          bridgeCalls += 1;
          return Map<String, Object?>.from(_bootstrapResponse);
        },
      );

      expect(bridgeCalls, 1);
      expect(paths, isEmpty);
      expect(controller.runtime.session.userId, 'guest-1');

      (runtime.generatedApiRuntime! as GeneratedApiRuntime).close(force: true);
      await server.close(force: true);
    },
  );

  test(
    'falls back to one generated bootstrap request when the bridge fails',
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

      await bootstrapAppSession(
        controller,
        earlyBootstrapReader: () async => throw StateError('bridge failed'),
      );

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

  test('falls back when prefetched JSON is malformed or scope-inconsistent', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final paths = <String>[];
    server.listen((request) async {
      paths.add(request.uri.path);
      request.response.headers.contentType = ContentType.json;
      request.response.write(jsonEncode(_bootstrapResponse));
      await request.response.close();
    });
    final earlyPayloads = <Map<String, Object?>>[
      {
        'session': 'not-an-object',
        'readerSummaries': <String, Object?>{},
      },
      {
        'session': _sessionResponse,
        'readerSummaries': {
          'tenantId': 'tenant-1',
          'workspaceId': 'different-workspace',
          'latest': {'items': <Object>[]},
          'periods': {'items': <Object>[]},
        },
      },
    ];

    for (final earlyPayload in earlyPayloads) {
      final runtime = AppFrontendRuntimeConfig(
        apiBaseUrl: 'http://${server.address.host}:${server.port}',
        correlationId: 'malformed-bootstrap-test',
      ).createRuntimeOrNull()!;
      final controller = AppRuntimeController(runtime);

      await bootstrapAppSession(
        controller,
        earlyBootstrapReader: () async => earlyPayload,
      );

      expect(controller.runtime.session.userId, 'guest-1');
      expect(controller.runtime.session.isRestoring, isFalse);
      (runtime.generatedApiRuntime! as GeneratedApiRuntime).close(force: true);
    }

    expect(paths, ['/app/bootstrap', '/app/bootstrap']);
    await server.close(force: true);
  });

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

    await bootstrapAppSession(
      controller,
      earlyBootstrapReader: () async => null,
    );

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
