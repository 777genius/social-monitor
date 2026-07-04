import 'package:flutter/widgets.dart';

/// Navigation destination rendered inside the app shell sidebar.
class AppShellDestination {
  const AppShellDestination({
    required this.label,
    required this.path,
    required this.icon,
  });

  final String label;
  final String path;
  final IconData icon;
}

/// Stable widget key for a destination row, derived from its route path.
String appShellDestinationKeyFor(String path) {
  if (path == '/') {
    return 'app-shell-destination-root';
  }

  final normalized = path
      .replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '-')
      .replaceAll(RegExp(r'^-|-$'), '');
  return 'app-shell-destination-$normalized';
}
