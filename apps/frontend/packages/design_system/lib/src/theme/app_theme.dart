import 'package:flutter/material.dart';

import '../tokens/app_colors.dart';

abstract final class AppTheme {
  static ThemeData light() {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: Brightness.light,
    ).copyWith(surface: AppColors.surface, outlineVariant: AppColors.border);

    return _build(
      colorScheme,
    ).copyWith(scaffoldBackgroundColor: AppColors.canvas);
  }

  static ThemeData dark() {
    final colorScheme =
        ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          brightness: Brightness.dark,
        ).copyWith(
          primary: const Color(0xFF60A5FA),
          onPrimary: const Color(0xFF07111F),
          surface: AppColors.darkSurface,
          surfaceContainerHighest: AppColors.darkSurfaceMuted,
          outline: AppColors.darkBorder,
          outlineVariant: AppColors.darkBorder,
          error: const Color(0xFFFB7185),
        );

    return _build(
      colorScheme,
    ).copyWith(scaffoldBackgroundColor: AppColors.darkCanvas);
  }

  static ThemeData _build(ColorScheme colorScheme) {
    final buttonShape = WidgetStatePropertyAll(
      RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      visualDensity: VisualDensity.standard,
      textButtonTheme: TextButtonThemeData(
        style: ButtonStyle(shape: buttonShape),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: ButtonStyle(shape: buttonShape),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(shape: buttonShape),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );
  }
}
