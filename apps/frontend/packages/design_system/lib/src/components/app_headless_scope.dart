import 'package:flutter/material.dart';
import 'package:headless/headless.dart';

class AppHeadlessScope extends StatelessWidget {
  const AppHeadlessScope({
    super.key,
    required this.theme,
    this.darkTheme,
    this.themeMode = ThemeMode.system,
    required this.appBuilder,
  });

  final ThemeData theme;
  final ThemeData? darkTheme;
  final ThemeMode themeMode;
  final Widget Function(TransitionBuilder overlayBuilder) appBuilder;

  @override
  Widget build(BuildContext context) {
    final effectiveTheme = _resolveTheme(context);

    return HeadlessApp(
      theme: AppHeadlessTheme.fromThemeData(effectiveTheme),
      appBuilder: appBuilder,
    );
  }

  ThemeData _resolveTheme(BuildContext context) {
    return switch (themeMode) {
      ThemeMode.light => theme,
      ThemeMode.dark => darkTheme ?? theme,
      ThemeMode.system =>
        _platformBrightness(context) == Brightness.dark
            ? darkTheme ?? theme
            : theme,
    };
  }

  Brightness _platformBrightness(BuildContext context) {
    return MediaQuery.maybePlatformBrightnessOf(context) ??
        WidgetsBinding.instance.platformDispatcher.platformBrightness;
  }
}

abstract final class AppHeadlessTheme {
  static MaterialHeadlessTheme fromThemeData(ThemeData theme) {
    return MaterialHeadlessTheme(
      colorScheme: theme.colorScheme,
      textTheme: theme.textTheme,
      defaults: const MaterialHeadlessDefaults(
        button: MaterialButtonOverrides(
          density: MaterialComponentDensity.standard,
          cornerStyle: MaterialCornerStyle.rounded,
        ),
        dropdown: MaterialDropdownOverrides(
          density: MaterialComponentDensity.standard,
          cornerStyle: MaterialCornerStyle.rounded,
        ),
      ),
    );
  }
}
