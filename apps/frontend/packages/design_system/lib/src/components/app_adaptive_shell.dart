import 'package:flutter/material.dart';
import 'package:headless_adaptive/headless_adaptive.dart';

import '../responsive/app_breakpoints.dart';
import '../tokens/app_spacing.dart';

class AppAdaptiveShell extends StatelessWidget {
  const AppAdaptiveShell({
    super.key,
    required this.title,
    required this.destinations,
    required this.selectedPath,
    required this.onDestinationSelected,
    required this.child,
    this.header,
    this.appBarActions = const [],
  });

  final String title;
  final List<AppShellDestination> destinations;
  final String selectedPath;
  final ValueChanged<String> onDestinationSelected;
  final Widget child;
  final Widget? header;
  final List<Widget> appBarActions;

  @override
  Widget build(BuildContext context) {
    return AdaptiveNavigationShell(
      policy: AppBreakpoints.policy,
      body: child,
      builder: (context, navigation, body) {
        final screen = AppScreenClass.fromAdaptive(
          navigation.adaptive.decision.screenClass,
        );
        final usesCompactNavigation = navigation.usesCompactNavigation;

        return Scaffold(
          appBar: usesCompactNavigation
              ? AppBar(title: Text(title), actions: appBarActions)
              : null,
          drawer: usesCompactNavigation
              ? Drawer(
                  child: _DestinationList(
                    title: title,
                    header: header,
                    destinations: destinations,
                    selectedPath: selectedPath,
                    onDestinationSelected: (path) {
                      Navigator.of(context).pop();
                      onDestinationSelected(path);
                    },
                  ),
                )
              : null,
          body: Row(
            children: [
              if (!usesCompactNavigation)
                SizedBox(
                  width: screen == AppScreenClass.medium ? 224 : 280,
                  child: _DestinationList(
                    title: title,
                    header: header,
                    destinations: destinations,
                    selectedPath: selectedPath,
                    onDestinationSelected: onDestinationSelected,
                  ),
                ),
              Expanded(child: body),
            ],
          ),
        );
      },
    );
  }
}

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

class _DestinationList extends StatelessWidget {
  const _DestinationList({
    required this.title,
    required this.header,
    required this.destinations,
    required this.selectedPath,
    required this.onDestinationSelected,
  });

  final String title;
  final Widget? header;
  final List<AppShellDestination> destinations;
  final String selectedPath;
  final ValueChanged<String> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0,
                ),
              ),
            ),
            if (header != null) ...[
              const SizedBox(height: AppSpacing.md),
              header!,
            ],
            const SizedBox(height: AppSpacing.lg),
            Expanded(
              child: ListView.separated(
                itemBuilder: (context, index) {
                  final destination = destinations[index];
                  final selected = selectedPath == destination.path;
                  return ListTile(
                    key: ValueKey(_destinationKeyFor(destination.path)),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    selected: selected,
                    leading: Icon(destination.icon),
                    title: Text(
                      destination.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    onTap: () => onDestinationSelected(destination.path),
                  );
                },
                separatorBuilder: (context, index) {
                  return const SizedBox(height: AppSpacing.xs);
                },
                itemCount: destinations.length,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _destinationKeyFor(String path) {
  if (path == '/') {
    return 'app-shell-destination-root';
  }

  final normalized = path
      .replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '-')
      .replaceAll(RegExp(r'^-|-$'), '');
  return 'app-shell-destination-$normalized';
}
