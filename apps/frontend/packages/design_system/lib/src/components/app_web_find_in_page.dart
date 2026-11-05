import 'package:find_in_page/find_in_page.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// Adds browser-style find-in-page behavior to a Flutter web subtree.
///
/// Other platforms receive [child] unchanged so their native find and
/// keyboard behavior is not affected.
final class AppWebFindInPage extends StatelessWidget {
  const AppWebFindInPage({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) {
      return child;
    }
    return FindInPageScope(child: child);
  }
}
