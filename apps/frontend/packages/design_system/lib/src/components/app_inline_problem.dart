import 'package:flutter/material.dart';

import '../tokens/app_colors.dart';
import '../tokens/app_spacing.dart';
import 'app_button.dart';

class AppInlineProblem extends StatelessWidget {
  const AppInlineProblem({
    super.key,
    required this.title,
    required this.message,
    this.tone = AppProblemTone.neutral,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String message;
  final AppProblemTone tone;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = _colors(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.background,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(_icon, color: colors.foreground, size: 22),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: colors.foreground,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    message,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colors.text,
                      height: 1.35,
                      letterSpacing: 0,
                    ),
                  ),
                  if (actionLabel != null && onAction != null) ...[
                    const SizedBox(height: AppSpacing.md),
                    AppButton(
                      label: actionLabel!,
                      onPressed: onAction,
                      variant: AppButtonVariant.secondary,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData get _icon {
    return switch (tone) {
      AppProblemTone.neutral => Icons.info_outline,
      AppProblemTone.warning => Icons.warning_amber_outlined,
      AppProblemTone.danger => Icons.error_outline,
    };
  }

  _ProblemColors _colors(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return switch (tone) {
      AppProblemTone.neutral => _ProblemColors(
        background: dark ? AppColors.darkSurfaceMuted : AppColors.surfaceMuted,
        border: dark ? AppColors.darkBorder : AppColors.border,
        foreground: dark ? AppColors.darkText : AppColors.ink,
        text: dark ? AppColors.darkTextMuted : AppColors.textMuted,
      ),
      AppProblemTone.warning => const _ProblemColors(
        background: Color(0xFFFFF7E6),
        border: Color(0xFFF0C36A),
        foreground: AppColors.amber,
        text: AppColors.ink,
      ),
      AppProblemTone.danger => const _ProblemColors(
        background: Color(0xFFFFEEF2),
        border: Color(0xFFFFB3C2),
        foreground: AppColors.rose,
        text: AppColors.ink,
      ),
    };
  }
}

enum AppProblemTone { neutral, warning, danger }

final class _ProblemColors {
  const _ProblemColors({
    required this.background,
    required this.border,
    required this.foreground,
    required this.text,
  });

  final Color background;
  final Color border;
  final Color foreground;
  final Color text;
}
