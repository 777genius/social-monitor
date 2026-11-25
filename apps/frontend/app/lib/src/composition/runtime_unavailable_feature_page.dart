import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

class RuntimeUnavailableFeaturePage extends StatelessWidget {
  const RuntimeUnavailableFeaturePage({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return AppPageSurface(
      child: AppInlineProblem(
        title: '$title data is not connected yet',
        message: 'Connect the backend runtime to load real workspace data.',
        tone: AppProblemTone.warning,
        actionLabel: null,
        onAction: null,
      ),
    );
  }
}
