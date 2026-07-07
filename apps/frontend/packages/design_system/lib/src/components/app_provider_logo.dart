import 'package:flutter/material.dart';

import 'app_provider_logo_marks.dart';

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
      return AppProviderGitHubMark(size: size, color: colorScheme.onSurface);
    }
    if (normalized == 'x-twitter' || normalized == 'twitter') {
      return AppProviderXMark(size: size, color: colorScheme.onSurface);
    }
    if (normalized == 'reddit') {
      return AppProviderRedditLogo(size: size);
    }
    if (normalized == 'hacker-news' || normalized == 'hn') {
      return _HackerNewsLogo(size: size);
    }
    if (normalized == 'rss') {
      return Icon(
        Icons.rss_feed_rounded,
        size: size,
        color: const Color(0xFFFF8800),
      );
    }
    return Icon(Icons.public_rounded, size: size, color: colorScheme.onSurface);
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
