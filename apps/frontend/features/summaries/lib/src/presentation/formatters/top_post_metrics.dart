import 'dart:math' as math;

import '../../domain/aggregates/reader_summary.dart';

/// One display metric slot in a top post row, e.g. `2.0K Likes`.
final class TopPostMetric {
  const TopPostMetric({required this.value, required this.label});

  final String value;
  final String label;

  bool get isMissing => value == '-';
}

const _metricSlotsByProvider = <String, List<String>>{
  'x-twitter': ['Likes', 'Reposts', 'Replies', 'Views'],
  'twitter': ['Likes', 'Reposts', 'Replies', 'Views'],
  'reddit': ['Upvotes', 'Comments', 'Shares', 'Views'],
  'hacker-news': ['Points', 'Comments', 'Shares', 'Views'],
  'github-trending-page': ['Stars', 'Stars today', 'Rank', 'Forks'],
  'github-issues': ['Comments', 'Reactions', 'Stars', 'Views'],
};

const _labelAliases = <String, String>{
  'like': 'Likes',
  'likes': 'Likes',
  'repost': 'Reposts',
  'reposts': 'Reposts',
  'reply': 'Replies',
  'replies': 'Replies',
  'view': 'Views',
  'views': 'Views',
  'upvote': 'Upvotes',
  'upvotes': 'Upvotes',
  'upvoted': 'Upvotes',
  'score': 'Upvotes',
  'comment': 'Comments',
  'comments': 'Comments',
  'share': 'Shares',
  'shares': 'Shares',
  'point': 'Points',
  'points': 'Points',
  'star': 'Stars',
  'stars': 'Stars',
  'fork': 'Forks',
  'forks': 'Forks',
  'reaction': 'Reactions',
  'reactions': 'Reactions',
};

/// Parses provider metrics into up to four display slots for a top post row.
///
/// Slots follow the provider's native vocabulary. Missing metrics are omitted
/// so rows do not show placeholder values such as `- Views`.
List<TopPostMetric> topPostMetricsFor(TopRead read) {
  final found = _parsedMetrics(read);
  final slots = _metricSlotsByProvider[read.providerKey.trim().toLowerCase()];
  if (slots == null) {
    if (found.isEmpty) {
      return const [];
    }
    return found.entries
        .take(4)
        .map((entry) => TopPostMetric(value: entry.value, label: entry.key))
        .toList(growable: false);
  }

  return [
    for (final label in slots)
      if (found[label] != null)
        TopPostMetric(value: found[label]!, label: label),
  ];
}

Map<String, String> _parsedMetrics(TopRead read) {
  final found = <String, String>{};
  for (final metric in read.providerMetrics) {
    _collectTrendingToday(metric, found);
    _collectFromText(metric.value, found);
    _collectLabeled(metric.label, metric.value, found);
  }
  return found;
}

void _collectTrendingToday(ProviderMetric metric, Map<String, String> found) {
  if (!metric.label.toLowerCase().contains('trending today')) {
    return;
  }
  final rank = RegExp(r'#\d+').firstMatch(metric.value)?.group(0);
  if (rank != null) {
    found.putIfAbsent('Rank', () => rank);
  }
  final starsToday = RegExp(
    r'\+([\d,.]+[kKmM]?)\s+stars today',
    caseSensitive: false,
  ).firstMatch(metric.value)?.group(1);
  if (starsToday != null) {
    found.putIfAbsent(
      'Stars today',
      () => '+${formatCompactMetricValue(starsToday)}',
    );
  }
}

final _numberWordPattern = RegExp(
  r'([\d][\d,.]*[kKmM]?)\s*(?:x\s+)?([a-zA-Z][a-zA-Z ]*)',
);

void _collectFromText(String text, Map<String, String> found) {
  for (final match in _numberWordPattern.allMatches(text)) {
    final rawValue = match.group(1)!;
    final phrase = match.group(2)!.trim().toLowerCase();
    if (phrase.startsWith('stars today')) {
      continue;
    }
    final word = phrase.split(RegExp(r'\s+')).first;
    final label = _labelAliases[word];
    if (label != null) {
      found.putIfAbsent(label, () => formatCompactMetricValue(rawValue));
    }
  }
}

void _collectLabeled(String label, String value, Map<String, String> found) {
  String? canonical;
  for (final word in label.trim().toLowerCase().split(RegExp(r'[^a-z]+'))) {
    canonical ??= _labelAliases[word];
  }
  if (canonical == null) {
    return;
  }
  final trimmed = value.trim();
  if (!RegExp(r'^[\d][\d,.]*[kKmM]?$').hasMatch(trimmed)) {
    return;
  }
  found.putIfAbsent(canonical, () => formatCompactMetricValue(trimmed));
}

/// Formats `2013` as `2.0K`, `39400` as `39K`, `8600` as `8.6K`.
String formatCompactMetricValue(String raw) {
  final normalized = raw.trim().replaceAll(',', '');
  if (normalized.toLowerCase().endsWith('k') ||
      normalized.toLowerCase().endsWith('m')) {
    return raw.trim().toUpperCase();
  }
  final value = num.tryParse(normalized);
  if (value == null) {
    return raw.trim();
  }
  return formatCompactCount(value);
}

/// Rough engagement score used for the "Engagement" sort: the sum of all
/// numeric provider metrics reported for the post.
num topPostEngagementScore(TopRead read) {
  num total = 0;
  for (final metric in read.providerMetrics) {
    for (final match in _numberWordPattern.allMatches(metric.value)) {
      total += _rawMetricNumber(match.group(1)!);
    }
    final labeled = metric.value.trim();
    if (RegExp(r'^[\d][\d,.]*[kKmM]?$').hasMatch(labeled)) {
      total += _rawMetricNumber(labeled);
    }
  }
  return total;
}

/// Position supplied by the GitHub Trending snapshot, where 1 ranks first.
int? githubTrendingPosition(TopRead read) {
  final providerPosition = read.providerRanking?.position;
  if (providerPosition != null && providerPosition > 0) {
    return providerPosition;
  }

  for (final metric in read.providerMetrics) {
    final match = RegExp(r'#\s*(\d+)').firstMatch(metric.value);
    final position = match == null ? null : int.tryParse(match.group(1)!);
    if (position != null && position > 0) {
      return position;
    }
  }
  return null;
}

/// Stars gained in the GitHub Trending snapshot window.
num? githubTrendingStarsGained(TopRead read) {
  final providerStarsGained = read.providerRanking?.starsGained;
  if (providerStarsGained != null && providerStarsGained >= 0) {
    return providerStarsGained;
  }

  for (final metric in read.providerMetrics) {
    final label = metric.label.trim().toLowerCase();
    if (label.contains('stars today') || label.contains('stars gained')) {
      final value = RegExp(
        r'[+]?\s*([\d][\d,.]*[kKmM]?)',
      ).firstMatch(metric.value)?.group(1);
      if (value != null) {
        return _rawMetricNumber(value);
      }
    }

    final value = RegExp(
      r'[+]?\s*([\d][\d,.]*[kKmM]?)\s+stars today',
      caseSensitive: false,
    ).firstMatch(metric.value)?.group(1);
    if (value != null) {
      return _rawMetricNumber(value);
    }
  }
  return null;
}

/// Reader-facing relevance sort score for the Top posts board.
///
/// `signalScore` remains the primary summary signal, while confirmation and
/// native engagement break close calls so single-source low-confidence items do
/// not float above stronger supported posts.
num topPostRelevanceSortScore(TopRead read) {
  final signal = read.signalScore.value;
  final confidence = read.confidence.score.clamp(0, 1);
  final confirmedProviderCount = _confirmedProviderCount(read);
  final confirmationBoost = confirmedProviderCount > 1
      ? math.min(0.75, 0.38 + confirmedProviderCount * 0.12)
      : switch (read.confidence.level.trim().toLowerCase()) {
          'high' => 0.34,
          'medium' => 0.22,
          _ => 0,
        };
  final engagementBoost = math.min(
    0.48,
    math.log(1 + topPostEngagementScore(read).toDouble()) / 20,
  );

  return signal + confidence * 0.55 + confirmationBoost + engagementBoost;
}

int _confirmedProviderCount(TopRead read) {
  final keys = {
    for (final key in read.confirmedProviderKeys)
      if (key.trim().isNotEmpty) key.trim().toLowerCase(),
  };

  return keys.isEmpty ? 1 : keys.length;
}

num _rawMetricNumber(String raw) {
  final normalized = raw.trim().toLowerCase().replaceAll(',', '');
  var multiplier = 1;
  var digits = normalized;
  if (normalized.endsWith('k')) {
    multiplier = 1000;
    digits = normalized.substring(0, normalized.length - 1);
  } else if (normalized.endsWith('m')) {
    multiplier = 1000000;
    digits = normalized.substring(0, normalized.length - 1);
  }
  return (num.tryParse(digits) ?? 0) * multiplier;
}

/// Compact english number formatting used across summary stats.
String formatCompactCount(num value) {
  if (value >= 1000000) {
    final millions = value / 1000000;
    return millions >= 10
        ? '${millions.round()}M'
        : '${millions.toStringAsFixed(1)}M';
  }
  if (value >= 10000) {
    return '${(value / 1000).round()}K';
  }
  if (value >= 1000) {
    return '${(value / 1000).toStringAsFixed(1)}K';
  }
  return value.round().toString();
}
