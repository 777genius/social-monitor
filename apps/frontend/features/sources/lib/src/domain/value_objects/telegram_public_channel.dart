/// Anonymous public channel identity; no invite links, posts or app-only paths.
String? normalizeTelegramPublicChannel(String input) {
  var value = input.trim();
  if (value.startsWith('@')) value = value.substring(1);
  if (value.startsWith('t.me/')) value = 'https://$value';
  if (value.contains('://')) {
    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host != 't.me' ||
        uri.userInfo.isNotEmpty ||
        uri.hasPort ||
        uri.hasQuery ||
        uri.hasFragment ||
        value.contains('%')) {
      return null;
    }
    final match = RegExp(
      r'^/(?:s/)?([A-Za-z][A-Za-z0-9_]{0,31})/?$',
    ).firstMatch(uri.path);
    if (match == null) return null;
    value = match.group(1)!;
  }
  if (!RegExp(r'^[A-Za-z][A-Za-z0-9_]{0,31}$').hasMatch(value)) return null;
  final channel = value.toLowerCase();
  if (const {
    's',
    'joinchat',
    'addstickers',
    'share',
    'login',
    'proxy',
    'iv',
    'c',
  }.contains(channel)) {
    return null;
  }
  return channel;
}
