import 'package:flutter/material.dart';

import '../responsive/app_breakpoints.dart';
import '../tokens/app_spacing.dart';

class AppPageSurface extends StatelessWidget {
  const AppPageSurface({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(padding: appPageSurfaceInsets(context), child: child);
  }
}

EdgeInsets appPageSurfaceInsets(BuildContext context) {
  final screen = AppScreenClass.of(context);

  return EdgeInsets.all(
    screen.when(
      compact: AppSpacing.md,
      medium: AppSpacing.lg,
      expanded: AppSpacing.xl,
    ),
  );
}
