import 'package:flutter/material.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/social_monitor_summaries.dart';

const fixtureSummaryId = '00000000-0000-7000-8000-000000000704';
const fixtureScope = WorkspaceScope(
  tenantId: '00000000-0000-7000-8000-000000000701',
  workspaceId: '00000000-0000-7000-8000-000000000702',
);

final class ReaderSummaryProductionWiringApp extends StatelessWidget {
  const ReaderSummaryProductionWiringApp({
    required this.runtime,
    required this.onOpenReaderSource,
    super.key,
  });

  final generated.GeneratedApiRuntime runtime;
  final void Function(Uri uri) onOpenReaderSource;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    final routeObserver = RouteObserver<ModalRoute<dynamic>>();
    return ModularityRoot(
      observer: routeObserver,
      child: AppHeadlessScope(
        theme: theme,
        appBuilder: (overlayBuilder) => MaterialApp(
          theme: theme,
          builder: overlayBuilder,
          navigatorObservers: [routeObserver],
          home: Scaffold(
            body: PublishedSummariesFeatureRoute.generatedApi(
              generatedApiRuntime: runtime,
              scope: fixtureScope,
              summaryId: fixtureSummaryId,
              onOpenReaderSource: onOpenReaderSource,
            ),
          ),
        ),
      ),
    );
  }
}
