import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:test/test.dart';

void main() {
  test('GeneratedApiRuntime calls the weekly projection route over HTTP', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final requestSeen = Completer<HttpRequest>();
    server.listen((request) {
      requestSeen.complete(request);
      request.response
        ..statusCode = HttpStatus.ok
        ..headers.contentType = ContentType.json
        ..write(jsonEncode(_unavailableProjection));
      unawaited(request.response.close());
    });
    addTearDown(() => server.close(force: true));

    final runtime = createGeneratedApiRuntime(
      GeneratedApiConfiguration(
        baseUrl: 'http://${server.address.address}:${server.port}',
        authorizationProvider: () => 'Bearer test-token',
        correlationIdProvider: () => 'weekly-route-test',
      ),
    );
    addTearDown(() => runtime.close(force: true));

    final response = await runtime.rest.readerSummaries
        .readerSummaryWeeklyProjectionControllerGet(
          weekStartedOn: '2026-07-20',
          xTenantId: 'tenant-test',
          xWorkspaceId: 'workspace-test',
          xWorkspaceRole: 'viewer',
        );
    final request = await requestSeen.future;

    expect(request.method, 'GET');
    expect(request.uri.path, '/reader-summaries/weekly');
    expect(request.uri.queryParameters, {'weekStartedOn': '2026-07-20'});
    expect(request.headers.value('x-tenant-id'), 'tenant-test');
    expect(request.headers.value('x-workspace-id'), 'workspace-test');
    expect(request.headers.value('x-workspace-role'), 'viewer');
    expect(request.headers.value('authorization'), 'Bearer test-token');
    expect(request.headers.value('x-correlation-id'), 'weekly-route-test');
    expect(response.status.toJson(), 'unavailable');
    expect(response.activeWeeklyCertifiedArtifactPresent, isFalse);
    expect(response.artifact, isNull);
  });
}

const _unavailableProjection = <String, Object?>{
  'schemaVersion': 'reader_summary.weekly_projection.v1',
  'tenantId': 'tenant-test',
  'workspaceId': 'workspace-test',
  'weekStartedOn': '2026-07-20',
  'weekEndedOn': '2026-07-26',
  'status': 'unavailable',
  'certifiedDailyEvidenceDates': <String>[],
  'missingDailyEvidenceDates': <String>[
    '2026-07-20',
    '2026-07-21',
    '2026-07-22',
    '2026-07-23',
    '2026-07-24',
    '2026-07-25',
    '2026-07-26',
  ],
  'blockingReasons': <String>[
    'certified_daily_evidence_incomplete',
    'active_weekly_certified_artifact_missing',
  ],
  'activeWeeklyCertifiedArtifactPresent': false,
  'evidenceLimitations': <Map<String, Object?>>[],
  'artifact': null,
};
