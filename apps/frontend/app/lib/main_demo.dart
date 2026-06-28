import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show ListTile;
import 'package:flutter/widgets.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:marionette_flutter/marionette_flutter.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import 'src/app/social_monitor_app.dart';
import 'src/composition/app_composition_root.dart';

Future<void> main() async {
  if (kDebugMode) {
    final logCollector = PrintLogCollector();
    MarionetteBinding.ensureInitialized(
      MarionetteConfiguration(
        isInteractiveWidget: _isDesignSystemInteractiveWidget,
        extractText: _extractDesignSystemText,
        logCollector: logCollector,
      ),
    );
    logCollector.addLog('Social Monitor demo Marionette binding initialized');
  } else {
    WidgetsFlutterBinding.ensureInitialized();
  }
  usePathUrlStrategy();

  const initialLocation = String.fromEnvironment(
    'SOCIAL_MONITOR_INITIAL_ROUTE',
    defaultValue: '/',
  );
  final composition = AppCompositionRoot.demo(initialLocation: initialLocation);

  runApp(SocialMonitorApp(composition: composition));
}

bool _isDesignSystemInteractiveWidget(Type type) {
  return type == AppButton ||
      type == AppFeatureCard ||
      type == AppWorkspaceSwitcher ||
      type == ListTile;
}

String? _extractDesignSystemText(Element element) {
  final widget = element.widget;
  return switch (widget) {
    AppButton(:final label) => label,
    AppFeatureCard(:final title) => title,
    AppWorkspaceSwitcher(:final workspaceName) => workspaceName,
    ListTile(:final title) => _textLabelFor(title),
    _ => null,
  };
}

String? _textLabelFor(Widget? widget) {
  return switch (widget) {
    Text(:final data) => data,
    _ => null,
  };
}
