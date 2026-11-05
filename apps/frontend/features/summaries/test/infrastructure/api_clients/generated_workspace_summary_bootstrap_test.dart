import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_period.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/api_clients/generated_summaries_api_client.dart';
import 'package:social_monitor_summaries/src/infrastructure/api_clients/summaries_api_client.dart';

void main() {
  test(
    'consumes bootstrap latest and periods once before using HTTP',
    () async {
      final runtime = generated.createGeneratedApiRuntime(
        const generated.GeneratedApiConfiguration(
          baseUrl: 'http://bootstrap-must-avoid-network.invalid',
          connectTimeout: Duration(milliseconds: 50),
        ),
      );
      final api = GeneratedSummariesApiClient(
        runtime: runtime,
        initialBootstrap: const generated.ReaderSummaryBootstrapResponseDto(
          tenantId: 'tenant-1',
          workspaceId: 'workspace-1',
          latest: generated.ListReaderSummariesResponseDto(items: []),
          periods: generated.ListReaderSummaryPeriodsResponseDto(items: []),
        ),
      );
      final request = LoadWorkspaceSummaryApiRequest(
        scope: const WorkspaceScope(
          tenantId: 'tenant-1',
          workspaceId: 'workspace-1',
        ),
        period: SummaryPeriodPreset.daily.resolve(),
        allowLatestFallback: true,
      );

      final latest = await api.loadWorkspaceSummary(request);
      final history = await api.loadWorkspaceSummaryHistory(request);

      expect(latest, isA<ResultSuccess<WorkspaceSummaryApiDto>>());
      expect(history, isA<ResultSuccess<WorkspaceSummaryApiDto>>());

      runtime.close(force: true);
    },
  );
}
