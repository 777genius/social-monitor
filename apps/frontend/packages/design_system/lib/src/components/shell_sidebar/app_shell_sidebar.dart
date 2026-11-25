import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_spacing.dart';
import 'app_shell_brand_logo.dart';
import 'app_shell_destination.dart';
import 'app_shell_sidebar_nav_item.dart';
import 'app_shell_sidebar_toggle.dart';

/// Dark navy navigation sidebar used by the app shell.
///
/// Supports a full mode (icons plus labels and pinned footer cards) and a
/// collapsed icon-only rail. When [contentWidth] is provided the content is
/// pinned to that width so the parent can animate the outer width and clip the
/// difference without triggering layout overflow mid-animation.
class AppShellSidebar extends StatefulWidget {
  const AppShellSidebar({
    super.key,
    required this.title,
    required this.destinations,
    required this.selectedPath,
    required this.onDestinationSelected,
    this.header = const [],
    this.footer = const [],
    this.collapsed = false,
    this.onToggleCollapsed,
    this.contentWidth,
  });

  final String title;
  final List<AppShellDestination> destinations;
  final String selectedPath;
  final ValueChanged<String> onDestinationSelected;
  final List<Widget> header;
  final List<Widget> footer;
  final bool collapsed;
  final VoidCallback? onToggleCollapsed;
  final double? contentWidth;

  @override
  State<AppShellSidebar> createState() => _AppShellSidebarState();
}

class _AppShellSidebarState extends State<AppShellSidebar> {
  static const _navRowExtent = 44.0 + AppSpacing.sm;

  final ScrollController _navController = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _revealSelected());
  }

  @override
  void didUpdateWidget(covariant AppShellSidebar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedPath != widget.selectedPath) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _revealSelected());
    }
  }

  @override
  void dispose() {
    _navController.dispose();
    super.dispose();
  }

  /// Keeps the active destination visible inside the scrollable nav region.
  void _revealSelected() {
    if (!mounted || !_navController.hasClients) {
      return;
    }
    final index = widget.destinations.indexWhere(
      (destination) => destination.path == widget.selectedPath,
    );
    if (index < 0) {
      return;
    }
    final position = _navController.position;
    final rowTop = index * _navRowExtent;
    final rowBottom = rowTop + _navRowExtent;
    if (rowBottom > position.pixels + position.viewportDimension) {
      _navController.animateTo(
        (rowBottom - position.viewportDimension).clamp(
          0.0,
          position.maxScrollExtent,
        ),
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
    } else if (rowTop < position.pixels) {
      _navController.animateTo(
        rowTop.clamp(0.0, position.maxScrollExtent),
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final collapsed = widget.collapsed;
    final toggle = widget.onToggleCollapsed;

    final content = ColoredBox(
      color: AppColors.sidebarBackground,
      child: SafeArea(
        child: Padding(
          padding: EdgeInsets.symmetric(
            horizontal: collapsed ? AppSpacing.sm : AppSpacing.md,
            vertical: AppSpacing.lg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _SidebarBrand(title: widget.title, collapsed: collapsed),
              if (!collapsed)
                for (final headerCard in widget.header) ...[
                  const SizedBox(height: AppSpacing.sm),
                  headerCard,
                ],
              const SizedBox(height: AppSpacing.xl),
              Expanded(
                child: SingleChildScrollView(
                  controller: _navController,
                  padding: EdgeInsets.zero,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final (index, destination)
                          in widget.destinations.indexed) ...[
                        if (index > 0) const SizedBox(height: AppSpacing.sm),
                        AppShellSidebarNavItem(
                          key: ValueKey(
                            appShellDestinationKeyFor(destination.path),
                          ),
                          destination: destination,
                          selected: widget.selectedPath == destination.path,
                          collapsed: collapsed,
                          onSelected: () =>
                              widget.onDestinationSelected(destination.path),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              if (!collapsed)
                for (final footerCard in widget.footer) ...[
                  const SizedBox(height: AppSpacing.sm),
                  footerCard,
                ],
              if (toggle != null) ...[
                const SizedBox(height: AppSpacing.sm),
                AppShellSidebarToggle(collapsed: collapsed, onPressed: toggle),
              ],
            ],
          ),
        ),
      ),
    );

    final width = widget.contentWidth;
    if (width == null) {
      return content;
    }

    return ClipRect(
      child: OverflowBox(
        alignment: Alignment.centerLeft,
        minWidth: width,
        maxWidth: width,
        child: content,
      ),
    );
  }
}

/// Brand mark plus optional product title.
class _SidebarBrand extends StatelessWidget {
  const _SidebarBrand({required this.title, required this.collapsed});

  final String title;
  final bool collapsed;

  @override
  Widget build(BuildContext context) {
    if (collapsed) {
      return AppShellBrandLogo(title: title, showLabel: false);
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      child: AppShellBrandLogo(title: title),
    );
  }
}
