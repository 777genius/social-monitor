import 'package:flutter/material.dart';

import '../composition/app_runtime.dart';

class AppSessionRestoringGate extends StatelessWidget {
  const AppSessionRestoringGate({
    super.key,
    required this.runtimeController,
    required this.child,
  });

  final AppRuntimeController runtimeController;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: runtimeController,
      child: child,
      builder: (context, child) {
        if (!runtimeController.runtime.session.isRestoring) {
          return child!;
        }
        return const Scaffold(
          body: Center(
            key: ValueKey('app-session-restoring'),
            child: CircularProgressIndicator(),
          ),
        );
      },
    );
  }
}
