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

  int? get reviewedCount {
    final collected = collectedFeedItemCount;
    if (collected == null) {
      return null;
    }
    return math.max(collected, selectedFeedItemCount);
  }

  int get notSelectedCount => math.max(
    (reviewedCount ?? selectedFeedItemCount) - selectedFeedItemCount,
    0,
  );

  String get primaryCountText {
    final reviewed = reviewedCount;
    if (collectionHealth?.state ==
            ReaderSummaryCollectionCoverageState.unavailable &&
        (reviewed ?? 0) == 0) {
      return 'Unavailable';
    }
    if (reviewed != null) {
      return '${formatCompactCount(reviewed)} reviewed';
    }
    return '${formatCompactCount(selectedFeedItemCount)} used';
  }

  String get detailText {
    final reviewed = reviewedCount;
    if (reviewed == null) {
      return selectedFeedItemCount == 0
          ? 'No posts used in summary'
          : '${formatCompactCount(selectedFeedItemCount)} used in summary';
    }
    if (reviewed == 0) {
      return 'No posts reviewed';
    }
    final percent = ((selectedFeedItemCount / reviewed) * 100).round();
    return '${formatCompactCount(selectedFeedItemCount)} used ($percent%)'
        ' · ${formatCompactCount(notSelectedCount)} not selected';
  }

  String get detailTooltipText {
    final reviewed = reviewedCount;
    if (reviewed == null) {
      return '${formatCompactCount(selectedFeedItemCount)} posts were used in '
          'this summary. The total reviewed count is unavailable.';
    }
    if (reviewed == 0) {
      return 'No posts were available for this summary.';
    }
    final details = <String>[
      '${_counted(reviewed, 'unique post', 'unique posts')} ${reviewed == 1 ? 'was' : 'were'} reviewed',
      '${_counted(selectedFeedItemCount, 'post', 'posts')} ${selectedFeedItemCount == 1 ? 'was' : 'were'} used in this summary',
      '${_counted(notSelectedCount, 'post', 'posts')} ${notSelectedCount == 1 ? 'was' : 'were'} not selected',
    ];
    if (topReadCount > 0) {
      details.add(_topReadsText(topReadCount));
    }
    if (citationCount > 0) {
      details.add(_counted(citationCount, 'citation', 'citations'));
    }
    if (lowRelevanceFeedItemCount > 0) {
      details.add(
        '${_counted(lowRelevanceFeedItemCount, 'post', 'posts')} marked low relevance',
      );
    }
    if (mutedFeedItemCount > 0) {
      details.add('${_counted(mutedFeedItemCount, 'post', 'posts')} muted');
    }
    if (userRatedFeedItemCount > 0) {
      details.add(
        '${_counted(userRatedFeedItemCount, 'post', 'posts')} rated by readers',
      );
    }
    return '${details.join('. ')}.';
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
        if (!_isGitHubProvider(provider.providerKey))
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
    if (key.isEmpty || _isGitHubProvider(key)) {
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
    if (_isGitHubProvider(entry.key)) {
      continue;
    }
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

bool _isGitHubProvider(String providerKey) {
  return switch (providerKey.trim().toLowerCase()) {
    'github' ||
    'github-issues' ||
    'github-trending-page' ||
    'github-repo-radar' => true,
    _ => false,
  };
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

String _collectionHealthDetails(ReaderSummaryProviderCollectionHealth health) {
  final details = <String>[
    _collectionHealthText(health),
    '${_counted(health.collectedItemCount, 'candidate', 'candidates')} checked',
  ];
  if (health.outsideWindowItemCount > 0) {
    details.add(
      '${_counted(health.outsideWindowItemCount, 'post', 'posts')} outside the summary date',
    );
  }
  final duplicateCount =
      health.paginationDuplicateItemCount + health.storageDuplicateItemCount;
  if (duplicateCount > 0) {
    details.add(
      _counted(duplicateCount, 'duplicate result', 'duplicate results'),
    );
  }
  if (health.insertedItemCount > 0) {
    details.add(
      '${_counted(health.insertedItemCount, 'new post', 'new posts')} saved',
    );
  }
  final collectionIsComplete =
      health.state == ReaderSummaryCollectionCoverageState.complete;
  if (!collectionIsComplete && health.rateLimitEventCount > 0) {
    details.add(
      health.rateLimitEventCount == 1
          ? 'Provider rate limit reached once'
          : 'Provider rate limit reached ${health.rateLimitEventCount} times',
    );
  }
  if (!collectionIsComplete) {
    details.addAll(
      health.failureKinds
          .where(
            (kind) => kind != 'rate_limited' || health.rateLimitEventCount == 0,
          )
          .map(_collectionFailureText),
    );
    details.addAll(
      health.paginationStopReasons
          .map(_collectionStopReasonText)
          .where((message) => message.isNotEmpty),
    );
  }
  return '${details.join('. ')}.';
}

String _collectionFailureText(String failureKind) {
  return switch (failureKind) {
    'rate_limited' => 'Provider rate limit reached',
    'auth_failed' => 'Provider sign-in failed',
    'unavailable' => 'Provider was unavailable',
    'invalid_query' => 'Collection query was invalid',
    _ => 'Provider reported a collection error',
  };
}

String _collectionStopReasonText(String stopReason) {
  return switch (stopReason) {
    'partial_retryable_failure' =>
      'Collection stopped early after a temporary provider error',
    'high_duplicate_rate' =>
      'Collection stopped after results became mostly duplicates',
    'low_new_item_yield' =>
      'Collection stopped after it stopped finding new posts',
    'max_pages' => 'Collection reached its page limit',
    'no_next_cursor' => 'Provider had no more result pages',
    'cursor_not_advanced' => 'Provider did not advance to a new result page',
    'failed' => 'Collection did not complete',
    'target_items' || 'single_page' => '',
    _ => 'Collection stopped before the configured target',
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

String _counted(int count, String singular, String plural) =>
    '${formatCompactCount(count)} ${count == 1 ? singular : plural}';

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
