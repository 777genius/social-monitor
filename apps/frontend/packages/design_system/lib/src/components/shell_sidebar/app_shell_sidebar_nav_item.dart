import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_spacing.dart';
import 'app_shell_destination.dart';

/// Single navigation row in the sidebar.
///
/// Renders icon plus label in expanded mode, and a centered icon with a
/// tooltip in the collapsed icon-rail mode.
class AppShellSidebarNavItem extends StatelessWidget {
  const AppShellSidebarNavItem({
    super.key,
    required this.destination,
    required this.selected,
    required this.onSelected,
    this.collapsed = false,
  });

  final AppShellDestination destination;
  final bool selected;
  final VoidCallback onSelected;
  final bool collapsed;

  @override
  Widget build(BuildContext context) {
    final foreground = selected
        ? AppColors.sidebarText
        : AppColors.sidebarTextMuted;

    final content = collapsed
        ? Center(child: Icon(destination.icon, size: 20, color: foreground))
        : Row(
            children: [
              Icon(destination.icon, size: 20, color: foreground),
              const SizedBox(width: AppSpacing.sm + 4),
              Expanded(
                child: Text(
                  destination.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: foreground,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                    letterSpacing: 0,
                  ),
                ),
              ),
            ],
          );

    final button = Semantics(
      button: true,
      selected: selected,
      label: destination.label,
      child: Material(
        color: selected ? AppColors.sidebarActive : Colors.transparent,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        child: InkWell(
          onTap: selected ? null : onSelected,
          hoverColor: Colors.white.withValues(alpha: 0.06),
          child: SizedBox(
            height: 44,
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: collapsed ? AppSpacing.xs : AppSpacing.md,
              ),
              child: content,
            ),
          ),
        ),
      ),
    );

    if (!collapsed) {
      return button;
    }

    return Tooltip(
      message: destination.label,
      preferBelow: false,
      child: button,
    );
  }
}
