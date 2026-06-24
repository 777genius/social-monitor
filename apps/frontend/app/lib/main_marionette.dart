import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show ListTile, TextButton;
import 'package:flutter/widgets.dart';
import 'package:marionette_flutter/marionette_flutter.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import 'src/app/social_monitor_app.dart';
import 'src/composition/app_composition_root.dart';

Future<void> main() async {
  if (kDebugMode) {
    final logCollector = PrintLogCollector();
    MarionetteBinding.ensureInitialized(
      MarionetteConfiguration(
        isInteractiveWidget: _isInteractiveWidget,
        extractText: _extractWidgetText,
        logCollector: logCollector,
      ),
    );
    logCollector.addLog(
      'Social Monitor production Marionette binding initialized',
    );
  } else {
    WidgetsFlutterBinding.ensureInitialized();
  }

  final composition = AppCompositionRoot.production();

  runApp(SocialMonitorApp(composition: composition));
}

bool _isInteractiveWidget(Type type) {
  return type == AppButton ||
      type == AppFeatureCard ||
      type == AppWorkspaceSwitcher ||
      type == ListTile ||
      type == TextButton;
}

String? _extractWidgetText(Element element) {
  final widget = element.widget;
  return switch (widget) {
    AppButton(:final label) => label,
    AppFeatureCard(:final title) => title,
    AppWorkspaceSwitcher(:final workspaceName) => workspaceName,
    ListTile(:final title) => _textLabelFor(title),
    TextButton(:final child) => _textLabelFor(child),
    _ => null,
  };
}

String? _textLabelFor(Widget? widget) {
  return switch (widget) {
    Text(:final data) => data,
    _ => null,
  };
}
