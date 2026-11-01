import 'package:flutter/widgets.dart';
import 'package:marionette_flutter/marionette_flutter.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../features/summaries/test/support/top_posts_show_more_test_app.dart';

/// Fixture-only entrypoint; never registered in product routing or release builds.
void main() {
  final logs = PrintLogCollector();
  MarionetteBinding.ensureInitialized(
    MarionetteConfiguration(
      isInteractiveWidget: (type) => type == AppButton,
      extractText: (element) => switch (element.widget) {
        AppButton(:final label) => label,
        _ => null,
      },
      logCollector: logs,
    ),
  );
  logs.addLog('Synthetic Top posts UI test initialized');
  runApp(const TopPostsShowMoreTestApp());
}
