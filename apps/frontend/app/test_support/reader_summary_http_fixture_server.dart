import 'dart:convert';
import 'dart:io';

import '../../features/summaries/integration_test/infrastructure/mappers/support/additional_stories_e2e_rest_boundary.dart';
import '../../features/summaries/integration_test/support/additional_stories_test_scenarios.dart';

const _tenantId = 'tenant-fixture';
const _workspaceId = 'workspace-fixture';

Future<void> main() async {
  final payload = additionalStoriesRestPayload(
    negativeCases: AdditionalStoriesNegativeCase.values.toSet(),
  );
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  var requestCount = 0;

  stdout.writeln(
    jsonEncode({
      'status': 'ready',
      'baseUrl': 'http://localhost:${server.port}',
    }),
  );

  Future<void> close() async {
    await server.close(force: true);
  }

  Future<void> shutdown(ProcessSignal _) async {
    await close();
    exit(0);
  }

  ProcessSignal.sigint.watch().listen(shutdown);
  ProcessSignal.sigterm.watch().listen(shutdown);

  await for (final request in server) {
    _setCorsHeaders(request.response);
    if (request.method == 'OPTIONS') {
      request.response.statusCode = HttpStatus.noContent;
      await request.response.close();
      continue;
    }
    if (request.method == 'GET' && request.uri.path == '/reader-summaries') {
      if (request.headers.value('x-tenant-id') != _tenantId ||
          request.headers.value('x-workspace-id') != _workspaceId) {
        await _sendJson(request.response, HttpStatus.badRequest, {
          'error': 'fixture_scope_mismatch',
        });
        continue;
      }
      requestCount += 1;
      await _sendJson(request.response, HttpStatus.ok, {
        'items': [payload],
        'nextCursor': null,
      });
      continue;
    }
    if (request.method == 'GET' && request.uri.path == '/__fixture/status') {
      await _sendJson(request.response, HttpStatus.ok, {
        'requestCount': requestCount,
      });
      continue;
    }
    await _sendJson(request.response, HttpStatus.notFound, {
      'error': 'not_found',
    });
  }
}

void _setCorsHeaders(HttpResponse response) {
  response.headers
    ..set(HttpHeaders.accessControlAllowOriginHeader, '*')
    ..set(HttpHeaders.accessControlAllowMethodsHeader, 'GET,OPTIONS')
    ..set(
      HttpHeaders.accessControlAllowHeadersHeader,
      'content-type,x-tenant-id,x-workspace-id,x-workspace-role',
    );
}

Future<void> _sendJson(
  HttpResponse response,
  int statusCode,
  Object body,
) async {
  response
    ..statusCode = statusCode
    ..headers.contentType = ContentType.json
    ..write(jsonEncode(body));
  await response.close();
}
