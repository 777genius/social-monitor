import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class SourceBindingFormDraft {
  String providerKey = 'reddit';
  String mode = 'search';
  String query = '';
  String subreddit = '';
  String listing = 'new';
  String feedUrl = '';

  void updateProvider(String value) {
    providerKey = value;
    if (value == 'rss' || value == 'github') {
      mode = 'search';
    }
  }

  void updateMode(String value) {
    mode = value;
  }

  ValidationFailure? validate() {
    if (providerKey == 'rss') {
      final uri = Uri.tryParse(feedUrl.trim());
      if (uri == null ||
          !(uri.scheme == 'http' || uri.scheme == 'https') ||
          uri.host.isEmpty) {
        return const ValidationFailure(
          message: 'RSS binding requires a valid http or https feed URL',
          code: 'source_bindings.feed_url_required',
        );
      }
      return null;
    }
    if (mode == 'listing') {
      if (providerKey == 'reddit' && !_isValidSubreddit(subreddit)) {
        return const ValidationFailure(
          message: 'Reddit listing requires a valid subreddit',
          code: 'source_bindings.subreddit_required',
        );
      }
      return null;
    }
    if (query.trim().isEmpty) {
      return const ValidationFailure(
        message: 'Search source binding requires a query',
        code: 'source_bindings.query_required',
      );
    }
    return null;
  }

  Map<String, Object?> config() {
    if (providerKey == 'rss') {
      return {'feedUrl': feedUrl.trim()};
    }
    if (mode == 'listing') {
      if (providerKey == 'reddit') {
        return {
          'mode': 'listing',
          'subreddit': subreddit.replaceFirst(RegExp(r'^r/'), '').trim(),
          'listing': listing,
        };
      }
      return {'mode': 'listing', 'listing': listing};
    }
    return {'mode': 'search', 'query': query.trim()};
  }

  bool _isValidSubreddit(String value) {
    final normalized = value.replaceFirst(RegExp(r'^r/'), '').trim();
    return RegExp(r'^[A-Za-z0-9_]{2,21}$').hasMatch(normalized);
  }
}
