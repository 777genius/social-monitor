import 'package:flutter/material.dart';

final class AppThemeModeController extends ChangeNotifier {
  AppThemeModeController({ThemeMode initialThemeMode = ThemeMode.system})
    : _themeMode = initialThemeMode;

  ThemeMode _themeMode;

  ThemeMode get themeMode => _themeMode;

  void setThemeMode(ThemeMode themeMode) {
    if (_themeMode == themeMode) {
      return;
    }

    _themeMode = themeMode;
    notifyListeners();
  }
}
