import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_spacing.dart';

/// Collapse/expand control for the persistent sidebar.
///
/// Rendered as a full-width row (icon plus label) in expanded mode and a
/// centered icon with a tooltip in the collapsed icon-only rail.
class AppShellSidebarToggle extends StatelessWidget {
  const AppShellSidebarToggle({
    super.key,
    required this.collapsed,
    required this.onPressed,
  });

  final bool collapsed;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    final icon = Icon(
      collapsed
          ? Icons.keyboard_double_arrow_right_rounded
          : Icons.keyboard_double_arrow_left_rounded,
      size: 20,
      color: AppColors.sidebarTextMuted,
    );

    final content = collapsed
        ? Center(child: icon)
        : Row(
            children: [
              icon,
              const SizedBox(width: AppSpacing.sm + 4),
              Expanded(
                child: Text(
                  'Collapse',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppColors.sidebarTextMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          );

    final button = Semantics(
      button: true,
      label: label,
      child: Material(
        color: Colors.transparent,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        child: InkWell(
          key: const ValueKey('app-shell-sidebar-toggle'),
          onTap: onPressed,
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

    return Tooltip(message: label, preferBelow: false, child: button);
  }
}
