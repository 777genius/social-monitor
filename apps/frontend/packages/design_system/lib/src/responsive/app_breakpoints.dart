import 'package:flutter/widgets.dart';
import 'package:headless_adaptive/headless_adaptive.dart';

abstract final class AppBreakpoints {
  static const mediumMinWidth = 720.0;
  static const expandedMinWidth = 1180.0;
  static const wideMinWidth = 1440.0;
  static const ultraWideMinWidth = 1600.0;

  static const policy = AdaptivePolicy(
    breakpoints: AdaptiveBreakpointSet([
      AdaptiveBreakpoint(screenClass: AdaptiveScreenClass.compact, minWidth: 0),
      AdaptiveBreakpoint(
        screenClass: AdaptiveScreenClass.medium,
        minWidth: mediumMinWidth,
      ),
      AdaptiveBreakpoint(
        screenClass: AdaptiveScreenClass.expanded,
        minWidth: expandedMinWidth,
      ),
      AdaptiveBreakpoint(
        screenClass: AdaptiveScreenClass.wide,
        minWidth: wideMinWidth,
      ),
      AdaptiveBreakpoint(
        screenClass: AdaptiveScreenClass.ultraWide,
        minWidth: ultraWideMinWidth,
      ),
    ]),
    navigation: AdaptiveNavigationPolicy(
      compact: AdaptiveNavigationPattern.drawer,
      medium: AdaptiveNavigationPattern.sidebar,
      expanded: AdaptiveNavigationPattern.sidebar,
      wide: AdaptiveNavigationPattern.sidebar,
      ultraWide: AdaptiveNavigationPattern.sidebar,
    ),
    panes: AdaptivePanePolicy(
      detailInlineFrom: AdaptiveScreenClass.expanded,
      supportingInlineFrom: AdaptiveScreenClass.wide,
    ),
  );
}

enum AppScreenClass {
  compact,
  medium,
  expanded;

  static AppScreenClass of(BuildContext context) {
    final environment = FlutterAdaptiveEnvironmentReader.fromContext(context);
    final decision = AppBreakpoints.policy.resolve(environment);
    return AppScreenClass.fromAdaptive(decision.screenClass);
  }

  static AppScreenClass fromAdaptive(AdaptiveScreenClass screenClass) {
    return switch (screenClass) {
      AdaptiveScreenClass.compact => AppScreenClass.compact,
      AdaptiveScreenClass.medium => AppScreenClass.medium,
      AdaptiveScreenClass.expanded ||
      AdaptiveScreenClass.wide ||
      AdaptiveScreenClass.ultraWide => AppScreenClass.expanded,
    };
  }

  bool get isCompact => this == AppScreenClass.compact;

  T when<T>({required T compact, required T medium, required T expanded}) {
    return switch (this) {
      AppScreenClass.compact => compact,
      AppScreenClass.medium => medium,
      AppScreenClass.expanded => expanded,
    };
  }
}
