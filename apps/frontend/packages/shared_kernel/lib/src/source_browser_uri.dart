/// Browser destinations are separate from the retained canonical provenance.
Uri? sourceBrowserUri(String canonicalUrl, {String? providerKey}) {
  final uri = Uri.tryParse(canonicalUrl);
  if (uri == null ||
      !const {'http', 'https'}.contains(uri.scheme) ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty) {
    return null;
  }
  const telegramHosts = {'t.me', 'telegram.me', 'telegram.dog'};
  if (providerKey?.trim().toLowerCase() != 'telegram' &&
      !telegramHosts.contains(uri.host)) {
    return uri;
  }
  if (!telegramHosts.contains(uri.host)) {
    return null;
  }
  final path = uri.pathSegments;
  final post = path.length == 3 && path.first == 's' ? path.sublist(1) : path;
  if (post.length != 2 ||
      !RegExp(r'^[a-zA-Z][a-zA-Z0-9_]*$').hasMatch(post[0]) ||
      !RegExp(r'^[1-9][0-9]*$').hasMatch(post[1])) {
    return null;
  }
  return Uri.https('t.me', '/s/${post[0]}/${post[1]}');
}
