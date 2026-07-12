import 'package:flutter/material.dart';

import '../../tokens/app_colors.dart';
import '../../tokens/app_spacing.dart';

/// Brand logo row: product mark plus title.
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
    final mark = SizedBox.square(
      dimension: 36,
      child: Semantics(
        label: 'Social Monitor',
        image: true,
        child: CustomPaint(
          key: ValueKey('app-shell-brand-mark'),
          painter: const _SocialMonitorBrandMarkPainter(),
        ),
      ),
    );

    if (!showLabel) {
      return Center(child: mark);
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

class _SocialMonitorBrandMarkPainter extends CustomPainter {
  const _SocialMonitorBrandMarkPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final bounds = Offset.zero & size;
    final circlePaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF13A8FF), Color(0xFF0877F9)],
      ).createShader(bounds);
    canvas.drawCircle(bounds.center, size.shortestSide * 0.45, circlePaint);

    final markPaint = Paint()..color = Colors.white;
    final horizontal = Rect.fromLTWH(
      size.width * 0.19,
      size.height * 0.39,
      size.width * 0.62,
      size.height * 0.22,
    );
    final vertical = Rect.fromLTWH(
      size.width * 0.39,
      size.height * 0.19,
      size.width * 0.22,
      size.height * 0.62,
    );
    final armRadius = Radius.circular(size.shortestSide * 0.11);
    canvas
      ..drawCircle(bounds.center, size.shortestSide * 0.17, markPaint)
      ..drawRRect(RRect.fromRectAndRadius(horizontal, armRadius), markPaint)
      ..drawRRect(RRect.fromRectAndRadius(vertical, armRadius), markPaint);
  }

  @override
  bool shouldRepaint(_SocialMonitorBrandMarkPainter oldDelegate) => false;
}
