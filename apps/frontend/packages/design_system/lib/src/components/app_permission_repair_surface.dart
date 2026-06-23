import 'package:flutter/material.dart';

import '../tokens/app_spacing.dart';
import 'app_button.dart';
import 'app_inline_problem.dart';

class AppPermissionRepairSurface extends StatelessWidget {
  const AppPermissionRepairSurface({
    super.key,
    required this.title,
    required this.message,
    required this.reasonCode,
    required this.actionLabel,
    required this.onAction,
    this.tone = AppProblemTone.warning,
  });

  final String title;
  final String message;
  final String reasonCode;
  final String actionLabel;
  final VoidCallback? onAction;
  final AppProblemTone tone;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        AppInlineProblem(title: title, message: message, tone: tone),
        const SizedBox(height: AppSpacing.md),
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: AppSpacing.md,
          runSpacing: AppSpacing.sm,
          children: [
            AppButton(
              label: actionLabel,
              icon: Icons.build_outlined,
              onPressed: onAction,
            ),
            Text(reasonCode, style: Theme.of(context).textTheme.labelSmall),
          ],
        ),
      ],
    );
  }
}
