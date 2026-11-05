import 'package:flutter/material.dart';

const readerSummaryUrlActionKeyPrefix = 'reader-summary-url-action-';
const readerSummaryUrlActionSemanticsPrefix = 'Reader summary URL action';

ValueKey<String> readerSummaryUrlActionKey(String kind, String identity) =>
    ValueKey('$readerSummaryUrlActionKeyPrefix$kind-$identity');

String readerSummaryUrlActionSemantics(String kind, String identity) =>
    '$readerSummaryUrlActionSemanticsPrefix: $kind, $identity';

String readerSummaryUrlIdentity(String url) {
  var hash = 0x811c9dc5;
  for (final codeUnit in url.codeUnits) {
    hash ^= codeUnit;
    hash = (hash * 0x01000193) & 0xffffffff;
  }
  return hash.toRadixString(16).padLeft(8, '0');
}
