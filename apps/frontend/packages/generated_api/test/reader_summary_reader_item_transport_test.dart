import 'package:social_monitor_generated_api/social_monitor_generated_api.dart';
import 'package:test/test.dart';

void main() {
  test('decodes reader card and cluster markers from raw REST JSON', () {
    final item = ReaderSummaryReaderItemDto.fromJson({
      'title': 'Cursor background agents launch',
      'providerKey': 'hacker-news',
      'providerName': 'Hacker News',
      'primaryActionKind': 'read_source',
      'reason': 'HN and X describe the same launch.',
      'matchedInterestIds': ['developer-tools'],
      'matchedRules': [
        'interest:developer-tools',
        'reader-card-kind:additional_notable_story',
        'reader-story-cluster:story:cursor-agents',
      ],
      'signalScore': 0.9,
      'confidence': {
        'level': 'medium',
        'score': 0.7,
        'rationale': 'Two cited sources describe the same launch.',
      },
      'confirmedProviderKeys': ['hacker-news', 'x-twitter'],
      'providerMetrics': <Object?>[],
      'whyImportant': ['The editor workflow changed.'],
      'whyNow': 'The launch appeared in this summary window.',
      'citationIds': ['cursor-hn', 'cursor-x'],
    });

    expect(
      item.matchedRules,
      containsAll([
        'reader-card-kind:additional_notable_story',
        'reader-story-cluster:story:cursor-agents',
      ]),
    );
  });

  test('preserves reserved related-topic markers without client regeneration', () {
    final item = ReaderSummaryReaderItemDto.fromJson({
      'title': 'Does Claude Code leave watermarks inside codes?',
      'providerKey': 'reddit',
      'providerName': 'Reddit',
      'primaryActionKind': 'read_source',
      'reason': 'A Reddit user asks about generated-code watermarking.',
      'matchedInterestIds': ['claude-code'],
      'matchedRules': [
        'reader-card-kind:related_topic',
        'reader-story-cluster:story:watermark-reddit-question',
        'reader-related-topic-relation:related-topic:v1:reddit:reddit-1mt-watermark-code:rss:anthropic-text-watermarking',
        'reader-related-topic-target:story:anthropic-watermark',
      ],
      'signalScore': 0.41,
      'confidence': {
        'level': 'low',
        'score': 0.4,
        'rationale': 'One Reddit subject source.',
      },
      'confirmedProviderKeys': ['reddit'],
      'providerMetrics': [
        {'label': 'Score', 'value': '7'},
      ],
      'whyImportant': ['The question is relevant to the official topic.'],
      'whyNow': 'Selected in the Aug 14 window.',
      'canonicalUrl':
          'https://www.reddit.com/r/ClaudeAI/comments/1mtwatermark/does_claude_code_leave_watermarks_inside_codes/',
      'citationIds': ['watermark-reddit'],
    });

    expect(
      item.matchedRules,
      containsAll([
        'reader-card-kind:related_topic',
        'reader-related-topic-target:story:anthropic-watermark',
      ]),
    );
  });
}
