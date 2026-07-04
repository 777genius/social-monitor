import 'package:flutter/material.dart';
import 'package:headless_adaptive/headless_adaptive.dart';

import '../responsive/app_breakpoints.dart';
import '../tokens/app_colors.dart';
import 'shell_sidebar/app_shell_destination.dart';
import 'shell_sidebar/app_shell_sidebar.dart';

export 'shell_sidebar/app_shell_brand_logo.dart';
export 'shell_sidebar/app_shell_destination.dart' show AppShellDestination;
export 'shell_sidebar/app_shell_sidebar.dart' show AppShellSidebar;
export 'shell_sidebar/app_shell_sidebar_card_surface.dart';
export 'shell_sidebar/app_shell_sidebar_cards.dart';
export 'shell_sidebar/app_shell_sidebar_menu_card.dart';

class AppAdaptiveShell extends StatefulWidget {
  const AppAdaptiveShell({
    super.key,
    required this.title,
    required this.destinations,
    required this.selectedPath,
    required this.onDestinationSelected,
    required this.child,
    this.sidebarHeader = const [],
    this.sidebarFooter = const [],
    this.appBarActions = const [],
  });

  final String title;
  final List<AppShellDestination> destinations;
  final String selectedPath;
  final ValueChanged<String> onDestinationSelected;
  final Widget child;
  final List<Widget> sidebarHeader;
  final List<Widget> sidebarFooter;
  final List<Widget> appBarActions;

  @override
  State<AppAdaptiveShell> createState() => _AppAdaptiveShellState();
}

class _AppAdaptiveShellState extends State<AppAdaptiveShell> {
  static const _collapsedWidth = 72.0;
  static const _mediumWidth = 216.0;
  static const _expandedWidth = 226.0;

  bool _collapsed = false;

  void _toggleCollapsed() {
    setState(() => _collapsed = !_collapsed);
  }

  @override
  Widget build(BuildContext context) {
    return AdaptiveNavigationShell(
      policy: AppBreakpoints.policy,
      body: widget.child,
      builder: (context, navigation, body) {
        final screen = AppScreenClass.fromAdaptive(
          navigation.adaptive.decision.screenClass,
        );
        final usesCompactNavigation = navigation.usesCompactNavigation;

        return Scaffold(
          appBar: usesCompactNavigation
              ? AppBar(
                  title: Text(widget.title),
                  actions: widget.appBarActions,
                )
              : null,
          drawer: usesCompactNavigation
              ? Drawer(
                  child: AppShellSidebar(
                    title: widget.title,
                    destinations: widget.destinations,
                    selectedPath: widget.selectedPath,
                    header: widget.sidebarHeader,
                    footer: widget.sidebarFooter,
                    onDestinationSelected: (path) {
                      Navigator.of(context).pop();
                      widget.onDestinationSelected(path);
                    },
                  ),
                )
              : null,
          body: Row(
            children: [
              if (!usesCompactNavigation)
                _buildPersistentSidebar(screen),
              Expanded(child: body),
            ],
          ),
        );
      },
    );
  }

  Widget _buildPersistentSidebar(AppScreenClass screen) {
    final expandedWidth = screen == AppScreenClass.medium
        ? _mediumWidth
        : _expandedWidth;
    final width = _collapsed ? _collapsedWidth : expandedWidth;

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutCubic,
      width: width,
      decoration: const BoxDecoration(color: AppColors.sidebarBackground),
      clipBehavior: Clip.hardEdge,
      child: AppShellSidebar(
        title: widget.title,
        destinations: widget.destinations,
        selectedPath: widget.selectedPath,
        header: widget.sidebarHeader,
        footer: widget.sidebarFooter,
        onDestinationSelected: widget.onDestinationSelected,
        collapsed: _collapsed,
        contentWidth: width,
        onToggleCollapsed: _toggleCollapsed,
      ),
    );
  }
}
