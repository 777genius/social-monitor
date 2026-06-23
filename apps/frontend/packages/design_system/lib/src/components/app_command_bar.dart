import 'package:flutter/material.dart';

import '../tokens/app_spacing.dart';
import 'app_button.dart';

class AppCommandBar extends StatelessWidget {
  const AppCommandBar({super.key, required this.actions});

  final List<AppCommandAction> actions;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        for (final action in actions)
          Tooltip(
            message: action.reason ?? action.label,
            child: AppButton(
              label: action.label,
              icon: action.icon,
              onPressed: action.enabled ? action.onPressed : null,
              variant: action.variant,
            ),
          ),
      ],
    );
  }
}

final class AppCommandAction {
  const AppCommandAction({
    required this.label,
    required this.onPressed,
    this.icon,
    this.enabled = true,
    this.reason,
    this.variant = AppButtonVariant.primary,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool enabled;
  final String? reason;
  final AppButtonVariant variant;
}
