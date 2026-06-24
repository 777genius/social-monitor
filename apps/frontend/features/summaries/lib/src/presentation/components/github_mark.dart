import 'package:flutter/material.dart';

class GitHubMark extends StatelessWidget {
  const GitHubMark({super.key, this.size = 18, this.color});

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(
        painter: _GitHubMarkPainter(
          color: color ?? Theme.of(context).colorScheme.onSurface,
        ),
      ),
    );
  }
}

class _GitHubMarkPainter extends CustomPainter {
  const _GitHubMarkPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.shortestSide / 16;
    final path = Path()
      ..moveTo(8, 0)
      ..cubicTo(3.58, 0, 0, 3.58, 0, 8)
      ..cubicTo(0, 11.54, 2.29, 14.53, 5.47, 15.59)
      ..cubicTo(5.87, 15.66, 6.02, 15.42, 6.02, 15.21)
      ..cubicTo(6.02, 15.02, 6.01, 14.39, 6.01, 13.72)
      ..cubicTo(4, 14.09, 3.48, 13.23, 3.32, 12.78)
      ..cubicTo(3.23, 12.55, 2.84, 11.84, 2.5, 11.65)
      ..cubicTo(2.22, 11.5, 1.82, 11.13, 2.49, 11.12)
      ..cubicTo(3.12, 11.11, 3.57, 11.7, 3.72, 11.94)
      ..cubicTo(4.44, 13.15, 5.59, 12.81, 6.05, 12.6)
      ..cubicTo(6.12, 12.08, 6.33, 11.73, 6.56, 11.4)
      ..cubicTo(4.78, 11.2, 2.92, 10.51, 2.92, 7.45)
      ..cubicTo(2.92, 6.58, 3.23, 5.86, 3.74, 5.3)
      ..cubicTo(3.66, 5.1, 3.38, 4.28, 3.82, 3.18)
      ..cubicTo(3.82, 3.18, 4.49, 2.97, 6.02, 4)
      ..cubicTo(6.66, 3.82, 7.34, 3.73, 8.02, 3.73)
      ..cubicTo(8.7, 3.73, 9.38, 3.82, 10.02, 4)
      ..cubicTo(11.55, 2.96, 12.22, 3.18, 12.22, 3.18)
      ..cubicTo(12.66, 4.28, 12.38, 5.1, 12.3, 5.3)
      ..cubicTo(12.81, 5.86, 13.12, 6.57, 13.12, 7.45)
      ..cubicTo(13.12, 10.52, 11.25, 11.2, 9.47, 11.4)
      ..cubicTo(9.76, 11.65, 10.01, 12.13, 10.01, 12.88)
      ..cubicTo(10.01, 13.95, 10, 14.81, 10, 15.08)
      ..cubicTo(10, 15.29, 10.15, 15.54, 10.55, 15.46)
      ..cubicTo(13.71, 14.4, 16, 11.42, 16, 8)
      ..cubicTo(16, 3.58, 12.42, 0, 8, 0)
      ..close();

    canvas.save();
    canvas.scale(scale, scale);
    canvas.drawPath(path, Paint()..color = color);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _GitHubMarkPainter oldDelegate) {
    return oldDelegate.color != color;
  }
}
