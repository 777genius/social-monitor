import 'package:flutter_test/flutter_test.dart';
import 'package:headless/headless.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

void main() {
  test('headless theme is created from app Material theme data', () {
    final headlessTheme = AppHeadlessTheme.fromThemeData(AppTheme.dark());

    expect(headlessTheme.capability<RButtonRenderer>(), isNotNull);
    expect(headlessTheme.capability<RDropdownButtonRenderer>(), isNotNull);
    expect(headlessTheme.capability<RTextFieldRenderer>(), isNotNull);
  });
}
