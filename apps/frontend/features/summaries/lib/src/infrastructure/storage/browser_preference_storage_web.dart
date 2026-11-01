import 'dart:js_interop';

// The only approved browser storage access in frontend features (ADR 398).
// It holds non-sensitive UI preference codes, never tenant, user or provider
// data. Storage can be missing or blocked (privacy modes, sandboxed frames,
// quota): every failure degrades to "nothing remembered".

@JS('localStorage')
external _BrowserPreferenceStorage? get _localStorage;

extension type _BrowserPreferenceStorage._(JSObject _) implements JSObject {
  external String? getItem(String key);
  external void setItem(String key, String value);
}

String? readBrowserPreference(String key) {
  try {
    return _localStorage?.getItem(key);
  } on Object {
    return null;
  }
}

void writeBrowserPreference(String key, String value) {
  try {
    _localStorage?.setItem(key, value);
  } on Object {
    // Best effort: the current session keeps the choice in memory.
  }
}
