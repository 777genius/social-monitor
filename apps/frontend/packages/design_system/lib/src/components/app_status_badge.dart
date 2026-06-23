import 'package:flutter/material.dart';

import '../tokens/app_colors.dart';

class AppStatusBadge extends StatelessWidget {
  const AppStatusBadge({
    super.key,
    required this.label,
    this.tone = AppStatusTone.neutral,
  });

  final String label;
  final AppStatusTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.background,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            color: colors.foreground,
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
      ),
    );
  }

  _BadgeColors _colors(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return switch (tone) {
      AppStatusTone.neutral => _BadgeColors(
        background: dark ? AppColors.darkSurfaceMuted : AppColors.surfaceMuted,
        border: dark ? AppColors.darkBorder : AppColors.border,
        foreground: dark ? AppColors.darkTextMuted : AppColors.textMuted,
      ),
      AppStatusTone.success => const _BadgeColors(
        background: Color(0xFFE6F7F4),
        border: Color(0xFF99D6CC),
        foreground: AppColors.teal,
      ),
      AppStatusTone.warning => const _BadgeColors(
        background: Color(0xFFFFF7E6),
        border: Color(0xFFF0C36A),
        foreground: AppColors.amber,
      ),
      AppStatusTone.danger => const _BadgeColors(
        background: Color(0xFFFFEEF2),
        border: Color(0xFFFFB3C2),
        foreground: AppColors.rose,
      ),
    };
  }
}

enum AppStatusTone { neutral, success, warning, danger }

final class _BadgeColors {
  const _BadgeColors({
    required this.background,
    required this.border,
    required this.foreground,
  });

  final Color background;
  final Color border;
  final Color foreground;
}
