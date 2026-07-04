import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class AppProviderLogo extends StatelessWidget {
  const AppProviderLogo({super.key, required this.providerKey, this.size = 18});

  final String providerKey;
  final double size;

  @override
  Widget build(BuildContext context) {
    final normalized = providerKey.trim().toLowerCase();
    final colorScheme = Theme.of(context).colorScheme;
    if (normalized == 'github' ||
        normalized == 'github-issues' ||
        normalized == 'github-trending-page' ||
        normalized == 'github-repo-radar') {
      return _GitHubMark(size: size, color: colorScheme.onSurface);
    }
    if (normalized == 'x-twitter' || normalized == 'twitter') {
      return _BrandSvgLogo(
        svg: _xLogoSvg,
        size: size,
        color: colorScheme.onSurface,
      );
    }
    if (normalized == 'reddit') {
      return _RedditLogo(size: size);
    }
    if (normalized == 'hacker-news' || normalized == 'hn') {
      return _HackerNewsLogo(size: size);
    }
    if (normalized == 'rss') {
      return _BrandSvgLogo(
        svg: _rssLogoSvg,
        size: size,
        color: const Color(0xFFFF8800),
      );
    }
    return Icon(Icons.public_rounded, size: size, color: colorScheme.onSurface);
  }
}

class _BrandSvgLogo extends StatelessWidget {
  const _BrandSvgLogo({
    required this.svg,
    required this.size,
    required this.color,
  });

  final String svg;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.string(
      svg,
      width: size,
      height: size,
      excludeFromSemantics: true,
      colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
    );
  }
}

class _RedditLogo extends StatelessWidget {
  const _RedditLogo({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: Color(0xFFFF4500),
        shape: BoxShape.circle,
      ),
      child: SizedBox.square(
        dimension: size,
        child: Center(
          child: _BrandSvgLogo(
            svg: _redditLogoSvg,
            size: size * 0.74,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}

class _HackerNewsLogo extends StatelessWidget {
  const _HackerNewsLogo({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFFF6600),
        borderRadius: BorderRadius.circular(3),
      ),
      child: SizedBox.square(
        dimension: size,
        child: Center(
          child: Text(
            'Y',
            style: TextStyle(
              color: Colors.white,
              fontSize: size * 0.68,
              fontWeight: FontWeight.w900,
              height: 1,
            ),
          ),
        ),
      ),
    );
  }
}

class _GitHubMark extends StatelessWidget {
  const _GitHubMark({this.size = 18, this.color});

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

    canvas
      ..save()
      ..scale(scale, scale)
      ..drawPath(path, Paint()..color = color)
      ..restore();
  }

  @override
  bool shouldRepaint(covariant _GitHubMarkPainter oldDelegate) {
    return oldDelegate.color != color;
  }
}

const _xLogoSvg =
    '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
    '<path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/>'
    '</svg>';

const _redditLogoSvg =
    '<svg role="img" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">'
    '<path d="M304.6 119a39.8 39.8 0 10-.3-17.3 64.2 64.2 0 00-57.2 63.8v.2a191 191 0 00-92.3 27.1A55.7 55.7 0 1097 287.4c1.8 64.7 72.3 116.7 159 116.7s157.3-52 159-116.8a55.7 55.7 0 10-57.8-94.5A191.4 191.4 0 00264 165.7v-.2a47 47 0 0140.5-46.5zm-152 153.3c.9-20.2 14.3-35.7 30-35.7 15.5 0 27.4 16.4 26.5 36.6-1 20.2-12.6 27.5-28.2 27.5s-29.3-8.2-28.4-28.4zm177.2-35.7c15.6 0 29 15.5 30 35.7.9 20.2-12.8 28.4-28.4 28.4-15.6 0-27.3-7.3-28.2-27.5-1-20.2 11-36.6 26.6-36.6zM311.2 319c3 .3 4.8 3.3 3.7 6a63.6 63.6 0 01-117.5 0 4.4 4.4 0 013.7-6 550.7 550.7 0 01110.1 0z"/>'
    '</svg>';

const _rssLogoSvg =
    '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
    '<path d="M19.199 24C19.199 13.467 10.533 4.8 0 4.8V0c13.165 0 24 10.835 24 24h-4.801zM3.291 17.415c1.814 0 3.293 1.479 3.293 3.295 0 1.813-1.485 3.29-3.301 3.29C1.47 24 0 22.526 0 20.71s1.475-3.294 3.291-3.295zM15.909 24h-4.665c0-6.169-5.075-11.245-11.244-11.245V8.09c8.727 0 15.909 7.184 15.909 15.91z"/>'
    '</svg>';
