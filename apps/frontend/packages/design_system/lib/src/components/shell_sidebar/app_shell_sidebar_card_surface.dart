import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_spacing.dart';

/// Bordered rounded surface shared by sidebar footer cards.
class AppSidebarCardSurface extends StatelessWidget {
  const AppSidebarCardSurface({
    super.key,
    required this.child,
    this.onTap,
    this.color,
  });

  final Widget child;
  final VoidCallback? onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color ?? Colors.transparent,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.sidebarBorder),
      ),
      child: InkWell(
        onTap: onTap,
        hoverColor: Colors.white.withValues(alpha: 0.05),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm + 4),
          child: child,
        ),
      ),
    );
  }
}
