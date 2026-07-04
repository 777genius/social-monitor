import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_spacing.dart';

import 'app_shell_sidebar_card_surface.dart';

/// Compact dropdown-style card, e.g. the theme selector at the sidebar bottom.
class AppSidebarMenuCard<T> extends StatelessWidget {
  const AppSidebarMenuCard({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    required this.items,
    required this.onSelected,
  });

  final IconData icon;
  final String label;
  final T value;
  final List<AppSidebarMenuItem<T>> items;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<T>(
      tooltip: label,
      position: PopupMenuPosition.over,
      onSelected: onSelected,
      itemBuilder: (context) => [
        for (final item in items)
          PopupMenuItem<T>(
            key: item.itemKey,
            value: item.value,
            child: Row(
              children: [
                Icon(item.icon, size: 18),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: Text(item.label)),
                if (item.value == value) const Icon(Icons.check, size: 18),
              ],
            ),
          ),
      ],
      child: AppSidebarCardSurface(
        child: Row(
          children: [
            Icon(icon, size: 18, color: AppColors.sidebarTextMuted),
            const SizedBox(width: AppSpacing.sm + 2),
            Expanded(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppColors.sidebarText,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const Icon(
              Icons.keyboard_arrow_down_rounded,
              size: 18,
              color: AppColors.sidebarTextMuted,
            ),
          ],
        ),
      ),
    );
  }
}

class AppSidebarMenuItem<T> {
  const AppSidebarMenuItem({
    required this.value,
    required this.icon,
    required this.label,
    this.itemKey,
  });

  final T value;
  final IconData icon;
  final String label;
  final Key? itemKey;
}
