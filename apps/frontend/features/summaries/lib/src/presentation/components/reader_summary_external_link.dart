import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import 'reader_summary_url_action_contract.dart';

class ReaderSummaryExternalLink extends StatefulWidget {
  const ReaderSummaryExternalLink({
    super.key,
    required this.url,
    this.actionIdentity,
    this.onOpenUrl,
    this.maxLines = 2,
  });

  final String url;
  final String? actionIdentity;
  final ValueChanged<String>? onOpenUrl;
  final int maxLines;

  @override
  State<ReaderSummaryExternalLink> createState() =>
      _ReaderSummaryExternalLinkState();
}

class _ReaderSummaryExternalLinkState extends State<ReaderSummaryExternalLink> {
  late final TapGestureRecognizer _tapRecognizer;

  @override
  void initState() {
    super.initState();
    _tapRecognizer = TapGestureRecognizer()..onTap = _openUrl;
  }

  @override
  void didUpdateWidget(covariant ReaderSummaryExternalLink oldWidget) {
    super.didUpdateWidget(oldWidget);
    _tapRecognizer.onTap = _openUrl;
  }

  @override
  void dispose() {
    _tapRecognizer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final canOpen = widget.onOpenUrl != null;
    final style = Theme.of(context).textTheme.labelSmall?.copyWith(
      color: Theme.of(context).colorScheme.primary,
      fontWeight: FontWeight.w800,
      letterSpacing: 0,
      height: 1.25,
    );

    final identity =
        widget.actionIdentity ?? readerSummaryUrlIdentity(widget.url);
    return Semantics(
      key: readerSummaryUrlActionKey('external-link', identity),
      link: canOpen,
      label: readerSummaryUrlActionSemantics('external-link', identity),
      child: MouseRegion(
        cursor: canOpen ? SystemMouseCursors.click : MouseCursor.defer,
        child: SelectableText.rich(
          TextSpan(
            text: widget.url,
            style: style,
            recognizer: canOpen ? _tapRecognizer : null,
          ),
          maxLines: widget.maxLines,
          selectionControls: materialTextSelectionControls,
        ),
      ),
    );
  }

  void _openUrl() {
    widget.onOpenUrl?.call(widget.url);
  }
}
