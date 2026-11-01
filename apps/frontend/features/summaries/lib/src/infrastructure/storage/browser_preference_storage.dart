// Per-origin browser preference storage on web; inert elsewhere (VM tests,
// future native shells), where nothing is remembered between launches.
export 'browser_preference_storage_stub.dart'
    if (dart.library.js_interop) 'browser_preference_storage_web.dart';
