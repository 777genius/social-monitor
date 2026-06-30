import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_sources/src/domain/entities/source_binding_overview.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_provider_key.dart';
import 'package:social_monitor_sources/src/presentation/components/source_provider_status_panel.dart';

void main() {
  testWidgets(
    'hides provider status when overview has no degradation reasons',
    (tester) async {
      await tester.pumpWidget(
        _TestApp(
          child: SourceProviderStatusPanel(
            state: ReadyViewState<SourceBindingOverview>(_healthyOverview()),
          ),
        ),
      );

      expect(find.text('Provider status'), findsNothing);
    },
  );

  testWidgets('groups provider status warnings by provider', (tester) async {
    await tester.pumpWidget(
      _TestApp(
        child: SourceProviderStatusPanel(
          state: ReadyViewState<SourceBindingOverview>(_degradedOverview()),
        ),
      ),
    );

    expect(find.text('Provider status'), findsOneWidget);
    expect(find.text('Reddit'), findsOneWidget);
    expect(find.text('rate_limited'), findsOneWidget);
    expect(find.text('x-twitter'), findsOneWidget);
    expect(find.text('auth_failed'), findsOneWidget);
  });
}

SourceBindingOverview _healthyOverview() {
  return const SourceBindingOverview(
    summary: SourceBindingOverviewSummary(
      totalBindings: 2,
      operatorAction: 'All systems operational.',
      degradationReasons: [],
      providerBreakdown: [],
    ),
  );
}

SourceBindingOverview _degradedOverview() {
  return const SourceBindingOverview(
    summary: SourceBindingOverviewSummary(
      totalBindings: 2,
      operatorAction: 'Review provider status',
      degradationReasons: [
        SourceBindingOverviewDegradationReason(
          code: 'rate_limited',
          severity: SourceBindingOverviewDegradationSeverity.warning,
          affectedBindings: 1,
          operatorAction: 'Wait for provider backoff.',
          sampleSourceBindingIds: ['binding-reddit'],
          signals: ['rate_limited'],
        ),
        SourceBindingOverviewDegradationReason(
          code: 'auth_failed',
          severity: SourceBindingOverviewDegradationSeverity.critical,
          affectedBindings: 1,
          operatorAction: 'Reconnect credentials.',
          sampleSourceBindingIds: ['binding-x'],
          signals: ['auth_failed'],
        ),
      ],
      providerBreakdown: [
        SourceBindingOverviewProviderBreakdown(
          providerKey: SourceProviderKey('reddit'),
          totalBindings: 1,
          degradationReasons: [
            SourceBindingOverviewDegradationReason(
              code: 'rate_limited',
              severity: SourceBindingOverviewDegradationSeverity.warning,
              affectedBindings: 1,
              operatorAction: 'Wait for provider backoff.',
              sampleSourceBindingIds: ['binding-reddit'],
              signals: ['rate_limited'],
            ),
          ],
        ),
        SourceBindingOverviewProviderBreakdown(
          providerKey: SourceProviderKey('x-twitter'),
          totalBindings: 1,
          degradationReasons: [
            SourceBindingOverviewDegradationReason(
              code: 'auth_failed',
              severity: SourceBindingOverviewDegradationSeverity.critical,
              affectedBindings: 1,
              operatorAction: 'Reconnect credentials.',
              sampleSourceBindingIds: ['binding-x'],
              signals: ['auth_failed'],
            ),
          ],
        ),
      ],
    ),
  );
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(body: child),
      ),
    );
  }
}
