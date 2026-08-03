import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class WeeklySummaryCitation {
  const WeeklySummaryCitation._({
    required this.citationId,
    required this.requestedUtcDate,
    required this.publicationId,
    required this.providerKey,
    required this.feedItemId,
    required this.sourceItemId,
    required this.sourceBindingId,
    required this.providerItemId,
    required this.canonicalUri,
    required this.sourceContentHash,
  });

  static Result<WeeklySummaryCitation> create({
    required String citationId,
    required String requestedUtcDate,
    required String publicationId,
    required String providerKey,
    required String feedItemId,
    required String sourceItemId,
    required String sourceBindingId,
    required String providerItemId,
    required String canonicalUrl,
    required String sourceContentHash,
  }) {
    final rawUri = Uri.tryParse(canonicalUrl);
    if (!_allNonBlank([
          citationId,
          requestedUtcDate,
          publicationId,
          providerKey,
          feedItemId,
          sourceItemId,
          sourceBindingId,
          providerItemId,
          sourceContentHash,
        ]) ||
        canonicalUrl.trim() != canonicalUrl ||
        rawUri == null ||
        !_hasSafeHttpsAuthority(rawUri)) {
      return _invalid();
    }

    final safeUri = Uri(
      scheme: 'https',
      host: rawUri.host,
      port: rawUri.hasPort ? rawUri.port : 0,
      path: rawUri.path,
    );
    return Result.success(
      WeeklySummaryCitation._(
        citationId: citationId,
        requestedUtcDate: requestedUtcDate,
        publicationId: publicationId,
        providerKey: providerKey,
        feedItemId: feedItemId,
        sourceItemId: sourceItemId,
        sourceBindingId: sourceBindingId,
        providerItemId: providerItemId,
        canonicalUri: safeUri,
        sourceContentHash: sourceContentHash,
      ),
    );
  }

  final String citationId;
  final String requestedUtcDate;
  final String publicationId;
  final String providerKey;
  final String feedItemId;
  final String sourceItemId;
  final String sourceBindingId;
  final String providerItemId;
  final Uri canonicalUri;
  final String sourceContentHash;

  String get safeDisplayLocation {
    final path = canonicalUri.path;
    return path.isEmpty || path == '/'
        ? canonicalUri.host
        : '${canonicalUri.host}$path';
  }

  static bool _allNonBlank(Iterable<String> values) =>
      values.every((value) => value.trim().isNotEmpty);

  static bool _hasSafeHttpsAuthority(Uri uri) =>
      uri.scheme.toLowerCase() == 'https' &&
      uri.authority.isNotEmpty &&
      uri.host.isNotEmpty &&
      uri.userInfo.isEmpty &&
      !uri.authority.contains('@');

  static Result<WeeklySummaryCitation> _invalid() => const Result.failure(
    ValidationFailure(
      message: 'Weekly summary citation could not be verified.',
      code: 'summaries.weekly_citation_invalid',
    ),
  );
}
