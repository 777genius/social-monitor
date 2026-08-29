import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('HTML starts a bounded no-store bootstrap before Flutter assets', () {
    final html = File('web/index.html').readAsStringSync();
    final fetch = html.indexOf("fetch('/app/bootstrap'");
    final bridge = html.indexOf('window.socialMonitorAppBootstrap');
    final flutter = html.indexOf('flutter_bootstrap.js');
    final dartModule = html.indexOf('main.dart.mjs');
    final dartWasm = html.indexOf('main.dart.wasm');

    expect(fetch, greaterThanOrEqualTo(0));
    expect(fetch, lessThan(dartModule));
    expect(fetch, lessThan(dartWasm));
    expect(bridge, greaterThanOrEqualTo(0));
    expect(bridge, lessThan(flutter));
    expect(html, contains("cache: 'no-store'"));
    expect(html, contains("credentials: 'same-origin'"));
    expect(html, contains('new AbortController()'));
    expect(html, contains('signal: controller.signal'));
    expect(html, contains('controller.abort()'));
    expect(html, contains('}, 3000)'));
    expect(html, isNot(contains('authorization')));
    expect(html, contains('if (pendingResponse === null)'));
    expect(html, contains('pendingResponse = null'));
  });
}
