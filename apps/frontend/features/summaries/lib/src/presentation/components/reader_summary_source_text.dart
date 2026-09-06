import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

/// Presentation only: never used to decide which sources qualify.
bool readerSummaryNeedsSourceDisclosure(String text) =>
    text.length > 118 || RegExp(r'[.!?。！？]\s*\S|[\r\n]').hasMatch(text);

class ReaderSummarySourceText extends StatefulWidget {
  const ReaderSummarySourceText(
    this.text, {
    super.key,
    this.style,
    this.maxLines = 2,
    this.overflow = TextOverflow.ellipsis,
  });

  final String text;
  final TextStyle? style;
  final int maxLines;
  final TextOverflow overflow;

  @override
  State<ReaderSummarySourceText> createState() => _SourceTextState();
}

class _SourceTextState extends State<ReaderSummarySourceText> {
  bool _expanded = false;

  @override
  void didUpdateWidget(covariant ReaderSummarySourceText oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.text != widget.text) _expanded = false;
  }

  @override
  Widget build(BuildContext context) {
    if (!readerSummaryNeedsSourceDisclosure(widget.text)) {
      return Tooltip(
        message: widget.text,
        child: Text(
          widget.text,
          style: widget.style,
          maxLines: widget.maxLines,
          overflow: widget.overflow,
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          label: _expanded ? 'Hide source text' : 'Source text',
          expanded: _expanded,
          child: AppButton(
            label: _expanded ? 'Hide source text' : 'Source text',
            controlKeyBase: 'reader-summary-source-text-toggle',
            variant: AppButtonVariant.text,
            onPressed: () => setState(() => _expanded = !_expanded),
          ),
        ),
        if (_expanded)
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 240),
            child: SingleChildScrollView(
              key: ValueKey(widget.text),
              primary: false,
              child: SelectableText(widget.text, style: widget.style),
            ),
          ),
      ],
    );
  }
}
