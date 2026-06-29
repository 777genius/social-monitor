part of 'reader_summary_brief_surface.dart';

final class _BriefText {
  const _BriefText(this.text) : url = null;
  const _BriefText.link(this.text, this.url);

  final String text;
  final String? url;
}

List<_BriefText> _joinedReadLinks(List<TopRead> reads) {
  final spans = <_BriefText>[];
  for (var index = 0; index < reads.length; index += 1) {
    final read = reads[index];
    if (index > 0) {
      spans.add(_BriefText(index == reads.length - 1 ? ' and ' : ', '));
    }
    spans.add(_BriefText.link(_shortTitle(read.title), read.canonicalUrl));
  }
  return spans;
}

TopRead? _firstReadForProvider(List<TopRead> reads, String providerKey) {
  for (final read in reads) {
    if (read.providerKey == providerKey) {
      return read;
    }
  }
  return null;
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

String _bestReason(TopRead read) {
  final candidates = [...read.whyImportant, read.reason, read.whyNow];
  for (final candidate in candidates) {
    final value = candidate.trim();
    if (value.isNotEmpty && !_isTechnicalEvidenceText(value)) {
      return value;
    }
  }
  if (read.providerMetrics.isNotEmpty) {
    return _providerMetricSummary(read.providerMetrics.first);
  }
  return 'Strong source signal in the current monitoring window.';
}

String? _readMetricSummary(TopRead read) {
  for (final metric in read.providerMetrics) {
    final value = _providerMetricSummary(metric);
    if (!_isTechnicalEvidenceText(value)) {
      return value;
    }
  }
  return null;
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

bool _isGithub(TopRead item) {
  final uri = Uri.tryParse(item.canonicalUrl ?? '');
  return item.providerKey == 'github-repo-radar' ||
      item.providerKey == 'github-trending-page' ||
      uri?.host.toLowerCase() == 'github.com';
}
