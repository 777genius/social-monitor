import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_spacing.dart';
import 'app_shell_sidebar_card_surface.dart';

/// Account/workspace card pinned to the sidebar footer.
class AppSidebarAccountCard extends StatelessWidget {
  const AppSidebarAccountCard({
    super.key,
    required this.name,
    required this.planLabel,
    this.onTap,
  });

  final String name;
  final String planLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return AppSidebarCardSurface(
      onTap: onTap,
      child: Row(
        children: [
          DecoratedBox(
            decoration: const BoxDecoration(
              color: AppColors.sidebarActive,
              shape: BoxShape.circle,
            ),
            child: SizedBox.square(
              dimension: 30,
              child: Center(
                child: Text(
                  name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase(),
                  style: textTheme.labelMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm + 2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.bodySmall?.copyWith(
                    color: AppColors.sidebarText,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  planLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.labelSmall?.copyWith(
                    color: AppColors.sidebarTextMuted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const Icon(
            Icons.keyboard_arrow_down_rounded,
            size: 18,
            color: AppColors.sidebarTextMuted,
          ),
        ],
      ),
    );
  }
}
