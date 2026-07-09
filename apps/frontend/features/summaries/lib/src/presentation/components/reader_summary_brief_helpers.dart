part of 'reader_summary_brief_surface.dart';

TopRead? _firstReadForProvider(List<TopRead> reads, String providerKey) {
  for (final read in reads) {
    if (read.providerKey == providerKey) {
      return read;
    }
  }
  return null;
}

String _ensureSentence(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return 'New signals are worth checking first.';
  }
  return trimmed.endsWith('.') ? trimmed : '$trimmed.';
}

String _summaryMarkdown(ReaderSummary summary) {
  final executiveSummary = summary.executiveSummary.trim();
  if (executiveSummary.isNotEmpty &&
      executiveSummary != 'No summary available') {
    return executiveSummary;
  }

  final takeaway = summary.content.oneLineTakeaway.trim();
  if (takeaway.isNotEmpty) {
    return _ensureSentence(takeaway);
  }

  return _ensureSentence(
    summary.content.interestSections.isEmpty
        ? summary.content.headline
        : summary.content.interestSections.first.insight,
  );
}

List<String> _summaryCitationIds(ReaderSummaryContent content) {
  for (final section in content.interestSections) {
    final ids = _uniqueCitationIds(section.citationIds);
    if (ids.isNotEmpty) {
      return ids.take(3).toList(growable: false);
    }
  }

  return _uniqueCitationIds(
    content.topReads.expand((read) => read.citationIds),
  ).take(3).toList(growable: false);
}

List<String> _uniqueCitationIds(Iterable<String> ids) {
  final seen = <String>{};
  final unique = <String>[];
  for (final id in ids) {
    final value = id.trim();
    if (value.isNotEmpty && seen.add(value)) {
      unique.add(value);
    }
  }
  return unique;
}

List<SummaryCitation> _citationsForIds(
  Iterable<String> ids,
  Map<String, SummaryCitation> citationsById,
) {
  return _uniqueCitationIds(ids)
      .map((id) => citationsById[id])
      .whereType<SummaryCitation>()
      .toList(growable: false);
}

Map<String, _CitationSourceContext> _citationSourceById(List<TopRead> reads) {
  final sources = <String, _CitationSourceContext>{};
  for (final read in reads) {
    for (final citationId in read.citationIds) {
      sources.putIfAbsent(
        citationId,
        () => _CitationSourceContext(
          title: _shortTitle(read.title),
          providerKey: read.providerKey,
          canonicalUrl: read.canonicalUrl,
          read: read,
        ),
      );
    }
  }
  return sources;
}

String _primaryTheme(ReaderSummaryContent content) {
  final headline = content.headline.trim();
  if (headline.isNotEmpty && !_isSourceInventoryHeadline(headline)) {
    return _cleanSentence(headline);
  }
  if (content.topReads.isNotEmpty) {
    final title = _shortTitle(content.topReads.first.title).trim();
    if (title.isNotEmpty) {
      return title;
    }
  }
  if (content.interestSections.isNotEmpty) {
    final title = content.interestSections.first.title.trim();
    if (title.isNotEmpty) {
      return '$title is becoming practical infrastructure, not just a demo';
    }
  }
  return _cleanSentence(content.oneLineTakeaway);
}

bool _isSourceInventoryHeadline(String value) {
  final lower = value.trim().toLowerCase();
  return lower.startsWith('key signals across') ||
      lower.startsWith('strongest reads across') ||
      lower.startsWith('strongest read across') ||
      lower.startsWith('source watch') ||
      lower.contains('cited top read');
}

String _headlineCopy(String primaryTheme) {
  final value = _cleanSentence(primaryTheme);
  return value.endsWith('.') ? value : '$value.';
}

String? _citationSnippet(SummaryCitation citation) {
  return readerSummaryDisplayCitationSnippet(citation);
}

String _providerMetricSummary(ProviderMetric metric) {
  final label = metric.label.trim();
  final value = metric.value.trim();
  if (label.isEmpty) {
    return value;
  }
  if (value.isEmpty) {
    return label;
  }
  return '$label: $value';
}

bool _isTechnicalEvidenceText(String value) {
  return readerSummaryIsTechnicalEvidenceText(value);
}

String _cleanSentence(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return 'new signals are worth checking first';
  }
  return trimmed.endsWith('.')
      ? trimmed.substring(0, trimmed.length - 1)
      : trimmed;
}

String _shortTitle(String value) {
  return value
      .replaceFirst(RegExp(r'^X post by @[^:]+:\s*'), '')
      .replaceFirst(' is #1 on GitHub Trending', '')
      .replaceFirst(' is #5 on GitHub Trending', '')
      .trim();
}

bool _citationMatchesProvider(SummaryCitation citation, String providerKey) {
  final haystack =
      '${citation.sourceLabel} ${citation.safeSnippet} ${citation.canonicalUrl ?? ''}'
          .toLowerCase();
  return switch (providerKey) {
    'x-twitter' =>
      haystack.contains('x/twitter') || haystack.contains('x.com/'),
    'reddit' => haystack.contains('reddit'),
    'hacker-news' =>
      haystack.contains('hacker news') ||
          haystack.contains('news.ycombinator') ||
          haystack.contains('hn:'),
    'github-trending-page' =>
      haystack.contains('github trending') ||
          (haystack.contains('github.com') && haystack.contains('trending')),
    'github-issues' =>
      haystack.contains('github issue') ||
          (haystack.contains('github.com') && haystack.contains('issue')),
    'rss' => haystack.contains('rss') || haystack.contains('hnrss'),
    _ => haystack.contains(providerKey.toLowerCase()),
  };
}
