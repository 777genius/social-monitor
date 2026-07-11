part of 'reader_summary_brief_surface.dart';

final class _ProviderCoverageRowData {
  const _ProviderCoverageRowData({
    required this.providerKey,
    required this.selectedFeedItemCount,
    required this.topReadCount,
    required this.citationCount,
    required this.lowRelevanceFeedItemCount,
    required this.mutedFeedItemCount,
    required this.userRatedFeedItemCount,
    required this.color,
    this.collectedFeedItemCount,
    this.collectionHealth,
  });

  final String providerKey;
  final int? collectedFeedItemCount;
  final int selectedFeedItemCount;
  final int topReadCount;
  final int citationCount;
  final int lowRelevanceFeedItemCount;
  final int mutedFeedItemCount;
  final int userRatedFeedItemCount;
  final Color color;
  final ReaderSummaryProviderCollectionHealth? collectionHealth;

  int get scaleCount {
    final collected = collectedFeedItemCount;
    final baseline = collected == null || collected < selectedFeedItemCount
        ? selectedFeedItemCount
        : collected;
    return baseline > 0 ? baseline : topReadCount;
  }

  String get primaryCountText {
    if (collectionHealth?.state ==
        ReaderSummaryCollectionCoverageState.unavailable) {
      return 'Unavailable';
    }
    final collected = collectedFeedItemCount;
    if (collected != null) {
      return '${formatCompactCount(collected)} collected';
    }
    return '${formatCompactCount(selectedFeedItemCount)} selected';
  }

  String get detailText {
    final parts = <String>[];
    final health = collectionHealth;
    if (health != null &&
        health.state != ReaderSummaryCollectionCoverageState.complete) {
      parts.add(_collectionHealthText(health));
    }
    if (collectedFeedItemCount != null) {
      parts.add(_selectedCoverageText());
    }
    if (topReadCount > 0) {
      parts.add(_topReadsText(topReadCount));
    }
    if (citationCount > 0) {
      parts.add('${formatCompactCount(citationCount)} citations');
    }
    if (lowRelevanceFeedItemCount > 0) {
      parts.add('${formatCompactCount(lowRelevanceFeedItemCount)} low rel.');
    }
    if (mutedFeedItemCount > 0) {
      parts.add('${formatCompactCount(mutedFeedItemCount)} muted');
    }
    return parts.isEmpty ? 'No selected evidence' : parts.join(' · ');
  }

  String _selectedCoverageText() {
    final selected = '${formatCompactCount(selectedFeedItemCount)} selected';
    final collected = collectedFeedItemCount;
    if (collected == null || collected <= 0 || selectedFeedItemCount <= 0) {
      return selected;
    }
    final percent = ((selectedFeedItemCount / collected) * 100).round();
    return '$selected ($percent%)';
  }

  bool get hasEvidence {
    return collectionHealth != null ||
        (collectedFeedItemCount ?? 0) > 0 ||
        selectedFeedItemCount > 0 ||
        topReadCount > 0 ||
        citationCount > 0;
  }
}

List<_ProviderCoverageRowData> _providerCoverageRows(ReaderSummary summary) {
  final coverage = summary.coverage;
  final coverageRows = coverage?.providerBreakdown ?? const [];
  if (coverageRows.isNotEmpty) {
    return _sortProviderCoverageRows([
      for (final provider in coverageRows)
        _ProviderCoverageRowData(
          providerKey: provider.providerKey,
          collectedFeedItemCount: _safeNullableCoverageCount(
            provider.collectedFeedItemCount,
          ),
          selectedFeedItemCount: _safeCoverageCount(
            provider.selectedFeedItemCount,
          ),
          topReadCount: _safeCoverageCount(provider.topReadCount),
          citationCount: _safeCoverageCount(provider.citationCount),
          lowRelevanceFeedItemCount: _safeCoverageCount(
            provider.lowRelevanceFeedItemCount,
          ),
          mutedFeedItemCount: _safeCoverageCount(provider.mutedFeedItemCount),
          userRatedFeedItemCount: _safeCoverageCount(
            provider.userRatedFeedItemCount,
          ),
          collectionHealth: provider.collectionHealth,
          color: _providerCoverageColor(provider.providerKey),
        ),
    ]);
  }

  final topReadCounts = <String, int>{};
  for (final read in summary.content.topReads) {
    final key = read.providerKey.trim();
    if (key.isEmpty) {
      continue;
    }
    topReadCounts[key] = (topReadCounts[key] ?? 0) + 1;
  }

  final rowsByProvider = <String, _ProviderCoverageRowData>{};
  for (final source in summary.content.sourceMix) {
    final key = source.providerKey.trim();
    if (key.isEmpty) {
      continue;
    }
    rowsByProvider[key] = _ProviderCoverageRowData(
      providerKey: key,
      selectedFeedItemCount: _safeCoverageCount(source.itemCount),
      topReadCount: topReadCounts[key] ?? 0,
      citationCount: _safeCoverageCount(source.citationCount),
      lowRelevanceFeedItemCount: 0,
      mutedFeedItemCount: 0,
      userRatedFeedItemCount: 0,
      color: _providerCoverageColor(key),
    );
  }

  for (final entry in topReadCounts.entries) {
    rowsByProvider.putIfAbsent(
      entry.key,
      () => _ProviderCoverageRowData(
        providerKey: entry.key,
        selectedFeedItemCount: 0,
        topReadCount: entry.value,
        citationCount: 0,
        lowRelevanceFeedItemCount: 0,
        mutedFeedItemCount: 0,
        userRatedFeedItemCount: 0,
        color: _providerCoverageColor(entry.key),
      ),
    );
  }

  return _sortProviderCoverageRows(rowsByProvider.values.toList());
}

String _collectionHealthText(ReaderSummaryProviderCollectionHealth health) {
  final target = health.targetItemCount;
  final accepted = formatCompactCount(health.acceptedItemCount);
  final progress = target == null
      ? '$accepted accepted'
      : '$accepted of ${formatCompactCount(target)} accepted';
  return switch (health.state) {
    ReaderSummaryCollectionCoverageState.partial =>
      'Partial collection: $progress',
    ReaderSummaryCollectionCoverageState.degraded =>
      'Degraded collection: $progress',
    ReaderSummaryCollectionCoverageState.unavailable =>
      'Collection unavailable',
    ReaderSummaryCollectionCoverageState.unknown => 'Collection status unknown',
    ReaderSummaryCollectionCoverageState.complete => progress,
  };
}

List<_ProviderCoverageRowData> _sortProviderCoverageRows(
  List<_ProviderCoverageRowData> rows,
) {
  return rows.where((row) => row.hasEvidence).toList(growable: false)
    ..sort((left, right) {
      final collectedDiff = right.scaleCount - left.scaleCount;
      if (collectedDiff != 0) {
        return collectedDiff;
      }

      final selectedDiff =
          right.selectedFeedItemCount - left.selectedFeedItemCount;
      if (selectedDiff != 0) {
        return selectedDiff;
      }

      final topReadDiff = right.topReadCount - left.topReadCount;
      if (topReadDiff != 0) {
        return topReadDiff;
      }

      return left.providerKey.compareTo(right.providerKey);
    });
}

int _safeCoverageCount(int value) {
  return value < 0 ? 0 : value;
}

int? _safeNullableCoverageCount(int? value) {
  if (value == null) {
    return null;
  }
  return _safeCoverageCount(value);
}

String _topReadsText(int count) {
  final noun = count == 1 ? 'top read' : 'top reads';
  return '${formatCompactCount(count)} $noun';
}

Color _providerCoverageColor(String providerKey) {
  return switch (providerKey.trim().toLowerCase()) {
    'x-twitter' || 'twitter' => AppColors.chartBlue,
    'reddit' => AppColors.chartOrange,
    'hacker-news' || 'hn' => AppColors.chartRed,
    'github' ||
    'github-issues' ||
    'github-trending-page' ||
    'github-repo-radar' => AppColors.chartInk,
    'youtube' => AppColors.chartMagenta,
    'rss' => AppColors.chartViolet,
    _ => AppColors.chartTeal,
  };
}
