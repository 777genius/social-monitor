import 'dart:convert';
import 'dart:js_interop';

@JS('socialMonitorAppBootstrap.take')
external JSPromise<JSString?> _takeEarlyAppBootstrap();

Future<Map<String, Object?>?> takeEarlyAppBootstrap() async {
  try {
    final body = (await _takeEarlyAppBootstrap().toDart)?.toDart;
    final value = body == null ? null : jsonDecode(body);
    if (value is! Map<Object?, Object?>) {
      return null;
    }
    return Map<String, Object?>.from(value);
  } on Object {
    // Non-web tests, older cached HTML, failed fetches, and malformed payloads
    // all fall back to the generated REST client.
    return null;
  }
}
