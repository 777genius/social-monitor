import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_spacing.dart';

/// Brand logo row: gradient mark plus product title.
///
/// When [showLabel] is false only the gradient mark is rendered, which suits
/// the collapsed icon-only sidebar rail.
class AppShellBrandLogo extends StatelessWidget {
  const AppShellBrandLogo({
    super.key,
    required this.title,
    this.showLabel = true,
  });

  final String title;
  final bool showLabel;

  @override
  Widget build(BuildContext context) {
    const mark = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF3B6BF0), AppColors.sidebarActive],
        ),
        borderRadius: BorderRadius.all(Radius.circular(10)),
      ),
      child: SizedBox.square(
        dimension: 36,
        child: Icon(Icons.donut_large_rounded, size: 20, color: Colors.white),
      ),
    );

    if (!showLabel) {
      return const Center(child: mark);
    }

    return Row(
      children: [
        mark,
        const SizedBox(width: AppSpacing.sm + 2),
        Expanded(
          child: FittedBox(
            key: const ValueKey('app-shell-brand-title-fit'),
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            child: Text(
              key: const ValueKey('app-shell-brand-title'),
              title,
              maxLines: 1,
              softWrap: false,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: AppColors.sidebarText,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.2,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
