part of 'reader_summary_brief_surface.dart';

final class _MetricBadgeData {
  const _MetricBadgeData({
    required this.icon,
    required this.label,
    this.tone = _MetricBadgeTone.neutral,
  });

  final IconData icon;
  final String label;
  final _MetricBadgeTone tone;
}

enum _MetricBadgeTone { neutral, success }

class _ReadMetricBadges extends StatelessWidget {
  const _ReadMetricBadges({required this.read, this.includeRank = true});

  final TopRead read;
  final bool includeRank;

  @override
  Widget build(BuildContext context) {
    final badges = _metricBadgesFor(read, includeRank: includeRank);
    if (badges.isEmpty) {
      return const SizedBox.shrink();
    }

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [for (final badge in badges) _MetricBadge(data: badge)],
    );
  }
}

class _MetricBadge extends StatelessWidget {
  const _MetricBadge({required this.data});

  final _MetricBadgeData data;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final colors = switch (data.tone) {
      _MetricBadgeTone.neutral => (
        background: colorScheme.surfaceContainerLow,
        border: colorScheme.outlineVariant,
        foreground: colorScheme.primary,
      ),
      _MetricBadgeTone.success => (
        background: const Color(0xFFE6F7F4),
        border: const Color(0xFF99D6CC),
        foreground: const Color(0xFF12806A),
      ),
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.background,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(data.icon, size: 14, color: colors.foreground),
            const SizedBox(width: 4),
            Text(
              data.label,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                height: 1,
                color: data.tone == _MetricBadgeTone.success
                    ? colors.foreground
                    : null,
                fontWeight: FontWeight.w800,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReadRankBadge extends StatelessWidget {
  const _ReadRankBadge({required this.rank});

  final int rank;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerLow,
        border: Border.all(color: colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(999),
      ),
      child: SizedBox(
        width: 30,
        height: 24,
        child: Center(
          child: Text(
            '#$rank',
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              height: 1,
              fontWeight: FontWeight.w900,
              letterSpacing: 0,
            ),
          ),
        ),
      ),
    );
  }
}

List<_MetricBadgeData> _metricBadgesFor(
  TopRead read, {
  bool includeRank = true,
}) {
  if (read.providerKey == 'github-trending-page') {
    return _githubMetricBadges(read.providerMetrics, includeRank: includeRank);
  }

  final badges = <_MetricBadgeData>[];
  for (final metric in read.providerMetrics) {
    for (final value in _metricPartsFor(metric)) {
      if (_isTechnicalEvidenceText(value) || _isZeroMetricText(value)) {
        continue;
      }
      badges.add(_badgeForMetricPart(value));
    }
  }
  return _uniqueBadgeLabels(badges).take(4).toList(growable: false);
}

List<_MetricBadgeData> _githubMetricBadges(
  List<ProviderMetric> metrics, {
  required bool includeRank,
}) {
  final badges = <_MetricBadgeData>[];
  final dailyMetric = _firstMetricWhere(
    metrics,
    (metric) => metric.label.toLowerCase().contains('trending today'),
  );
  final starsMetric = _firstMetricWhere(
    metrics,
    (metric) => metric.label.toLowerCase() == 'stars',
  );

  final dailyValue = dailyMetric?.value.trim();
  if (dailyValue != null && dailyValue.isNotEmpty) {
    final rank = RegExp(r'#\d+').firstMatch(dailyValue)?.group(0);
    final starsToday = RegExp(
      r'\+[\d,.]+\s+stars today',
      caseSensitive: false,
    ).firstMatch(dailyValue)?.group(0);
    if (includeRank && rank != null) {
      badges.add(
        _MetricBadgeData(icon: Icons.trending_up_rounded, label: rank),
      );
    }
    if (starsToday != null) {
      badges.add(_MetricBadgeData(icon: Icons.star_rounded, label: starsToday));
    } else {
      badges.add(
        _MetricBadgeData(icon: Icons.trending_up_rounded, label: dailyValue),
      );
    }
  }

  final starsValue = starsMetric?.value.trim();
  if (starsValue != null && starsValue.isNotEmpty) {
    badges.add(
      _MetricBadgeData(
        icon: Icons.star_border_rounded,
        label: '$starsValue stars',
      ),
    );
  }

  return badges.take(4).toList(growable: false);
}

ProviderMetric? _firstMetricWhere(
  List<ProviderMetric> metrics,
  bool Function(ProviderMetric metric) matches,
) {
  for (final metric in metrics) {
    if (matches(metric)) {
      return metric;
    }
  }
  return null;
}

List<String> _metricParts(String value) {
  final withoutProviderPrefix = value.replaceFirst(
    RegExp(r'^[A-Za-z/ ]+ evidence:\s*'),
    '',
  );
  return withoutProviderPrefix
      .split(RegExp(r',\s+| · '))
      .map((part) => part.trim())
      .where((part) => part.isNotEmpty)
      .toList(growable: false);
}

List<String> _metricPartsFor(ProviderMetric metric) {
  final label = metric.label.trim();
  final value = metric.value.trim();
  if (value.isEmpty) {
    return label.isEmpty ? const [] : [label];
  }

  final labelLower = label.toLowerCase();
  if (labelLower.contains('evidence') || _isPackedMetricSummary(value)) {
    return _metricParts(value);
  }

  final normalized = _singleMetricLabel(labelLower, value);
  return normalized == null
      ? _metricParts(_providerMetricSummary(metric))
      : [normalized];
}

bool _isPackedMetricSummary(String value) {
  final lower = value.toLowerCase();
  return (value.contains(',') || value.contains(' · ')) &&
      (lower.contains('score') ||
          lower.contains('comment') ||
          lower.contains('upvoted') ||
          lower.contains('point') ||
          lower.contains('like') ||
          lower.contains('repost') ||
          lower.contains('reply'));
}

String? _singleMetricLabel(String labelLower, String value) {
  if (labelLower == 'score') {
    return '$value score';
  }
  if (labelLower.contains('score') && _startsWithMetricNumber(value)) {
    return '$value score';
  }
  if (labelLower.contains('like') && _startsWithMetricNumber(value)) {
    return '$value likes';
  }
  if (labelLower.contains('repost') && _startsWithMetricNumber(value)) {
    return '$value reposts';
  }
  if (labelLower.contains('repl') && _startsWithMetricNumber(value)) {
    return '$value replies';
  }
  if (labelLower.contains('comment') && _startsWithMetricNumber(value)) {
    return '$value comments';
  }
  if (labelLower.contains('upvote') && _startsWithMetricNumber(value)) {
    return '$value upvoted';
  }
  if (labelLower.contains('point') && _startsWithMetricNumber(value)) {
    return '$value points';
  }
  return null;
}

bool _startsWithMetricNumber(String value) {
  return RegExp(r'^[-+]?\d').hasMatch(value.trim());
}

bool _isZeroMetricText(String value) {
  return RegExp(
    r'^(?:[a-z/ ]+:\s*)?0(?:\s+[a-z]+)?$',
    caseSensitive: false,
  ).hasMatch(value.trim());
}

_MetricBadgeData _badgeForMetricPart(String part) {
  final lower = part.toLowerCase();
  final icon = switch (lower) {
    final value when value.contains('like') => Icons.favorite_border_rounded,
    final value when value.contains('repost') => Icons.repeat_rounded,
    final value when value.contains('reply') => Icons.mode_comment_outlined,
    final value when value.contains('comment') => Icons.forum_outlined,
    final value when value.contains('upvoted') => Icons.thumb_up_alt_outlined,
    final value when value.contains('score') => Icons.arrow_upward_rounded,
    final value when value.contains('point') => Icons.arrow_upward_rounded,
    final value when value.contains('security') => Icons.shield_outlined,
    final value when value.contains('access') => Icons.lock_outline_rounded,
    _ => Icons.insights_outlined,
  };
  return _MetricBadgeData(icon: icon, label: part);
}
