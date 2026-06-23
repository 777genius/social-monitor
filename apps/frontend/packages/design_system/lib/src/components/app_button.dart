import 'package:flutter/material.dart';
import 'package:headless/headless.dart';

import '../tokens/app_colors.dart';

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.controlKeyBase,
    this.variant = AppButtonVariant.primary,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final String? controlKeyBase;
  final AppButtonVariant variant;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final style = _AppButtonStyle.resolve(
      colorScheme: Theme.of(context).colorScheme,
      variant: variant,
      enabled: enabled,
    );
    final child = icon == null
        ? Text(label, maxLines: 1, overflow: TextOverflow.ellipsis)
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          );

    return Theme(
      data: _withButtonStyle(Theme.of(context), style),
      child: RTextButton(
        key: ValueKey(
          '${controlKeyBase ?? 'app-button-$label-${variant.name}'}-$enabled',
        ),
        onPressed: onPressed,
        variant: _toHeadlessVariant(variant),
        size: RButtonSize.large,
        child: child,
      ),
    );
  }

  RButtonVariant _toHeadlessVariant(AppButtonVariant variant) {
    return switch (variant) {
      AppButtonVariant.primary => RButtonVariant.filled,
      AppButtonVariant.secondary => RButtonVariant.tonal,
      AppButtonVariant.text => RButtonVariant.text,
    };
  }

  ThemeData _withButtonStyle(ThemeData theme, _AppButtonStyle style) {
    final buttonStyle = ButtonStyle(
      foregroundColor: WidgetStatePropertyAll(style.foregroundColor),
      backgroundColor: WidgetStatePropertyAll(style.backgroundColor),
      side: WidgetStatePropertyAll(BorderSide(color: style.borderColor)),
      mouseCursor: WidgetStateProperty.resolveWith<MouseCursor?>((states) {
        return states.contains(WidgetState.disabled)
            ? SystemMouseCursors.basic
            : SystemMouseCursors.click;
      }),
      shape: WidgetStatePropertyAll(
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );

    return theme.copyWith(
      filledButtonTheme: FilledButtonThemeData(style: buttonStyle),
      textButtonTheme: TextButtonThemeData(style: buttonStyle),
    );
  }
}

enum AppButtonVariant { primary, secondary, text }

final class _AppButtonStyle {
  const _AppButtonStyle({
    required this.backgroundColor,
    required this.foregroundColor,
    required this.borderColor,
  });

  final Color backgroundColor;
  final Color foregroundColor;
  final Color borderColor;

  static _AppButtonStyle resolve({
    required ColorScheme colorScheme,
    required AppButtonVariant variant,
    required bool enabled,
  }) {
    if (!enabled) {
      return const _AppButtonStyle(
        backgroundColor: AppColors.surfaceMuted,
        foregroundColor: AppColors.textSoft,
        borderColor: Colors.transparent,
      );
    }

    return switch (variant) {
      AppButtonVariant.primary => _AppButtonStyle(
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        borderColor: Colors.transparent,
      ),
      AppButtonVariant.secondary => _AppButtonStyle(
        backgroundColor: AppColors.surfaceMuted,
        foregroundColor: colorScheme.primary,
        borderColor: Colors.transparent,
      ),
      AppButtonVariant.text => _AppButtonStyle(
        backgroundColor: Colors.transparent,
        foregroundColor: colorScheme.primary,
        borderColor: Colors.transparent,
      ),
    };
  }
}
