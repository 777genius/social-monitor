import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_promotion_comparator.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/generated_summary_rest_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';

import '../../support/reader_post_promotion_v3_sql_readback_fixture.dart';

void main() {
  test('maps a verified PostgreSQL news card with one-based slots', () {
    final payload = _payload();
    final transport = generated.ReaderSummaryArtifactResponseDto.fromJson(
      payload,
    );
    expect(transport.readerBrief.topReads, isEmpty);
    final transportAttestation = transport
        .readerBrief
        .newsWithoutRatingPosts
        .single
        .promotionAttestation!;
    final outer =
        jsonDecode(jsonEncode(transportAttestation.toJson()))
            as Map<String, dynamic>;
    final canonical =
        jsonDecode(transportAttestation.canonicalPayload)
            as Map<String, dynamic>;
    for (final key in [
      'provider',
      'storyId',
      'publishedAt',
      'periodStartedAt',
      'periodEndedAt',
      'ingestionCutoff',
      'exactIngestionCutoff',
      'assessment',
      'comparator',
    ]) {
      expect(outer[key], canonical[key], reason: key);
    }
    expect(
      (outer['presentation']! as Map<String, dynamic>)['schemaVersion'],
      (canonical['presentation']! as Map<String, dynamic>)['schemaVersion'],
    );
    final api = const GeneratedSummaryRestMapper().readerSummary(transport);
    expect(
      api.content.newsWithoutRatingPosts.single.promotionAttestation,
      isNotNull,
    );
    final summary = const SummaryMapper().readerSummaryToDomain(api);
    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.available,
    );
    final card = summary.content.newsWithoutRatingPosts.single;
    final attestation = card.promotionAttestation!;
    expect(card.cardKind, ReaderSummaryCardKind.newsWithoutRating);
    expect(card.signalScore.value, 0);
    expect(attestation.isV3, isTrue);
    expect(attestation.policyVersion, 'reader_promotion.2026-11-01');
    expect(attestation.placement, ReaderPostPromotionPlacement.news);
    expect(attestation.slot, 1);
    expect(attestation.providerKey, 'rss');
    expect(attestation.comparator!.block, ReaderPromotionBlock.unranked);
    expect(attestation.exactPublishedAt, '2026-06-14T09:00:00.123456Z');
  });

  test('withholds the board for a news card claiming a Signal', () {
    final payload = _payload();
    _newsCards(payload).first['signalScore'] = 1;
    expect(
      _map(payload).content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
  });

  for (final tamper in <String, void Function(Map<String, dynamic>)>{
    'citation identity': (payload) =>
        ((payload['citations']! as List<dynamic>).first
                as Map<String, dynamic>)['feedItemId'] =
            '00000000-0000-4000-8000-000000000009',
    'provider identity': (payload) =>
        ((payload['citations']! as List<dynamic>).first
                as Map<String, dynamic>)['providerKey'] =
            'reddit',
    'slot': (payload) => _reseal(payload, 0, (body) => body['slot'] = 2),
    'unknown version': (payload) => _reseal(payload, 0, (body) {
      body['schemaVersion'] = 'reader_post_promotion_attestation.v99';
    }),
  }.entries) {
    test('fails the whole V3 board for tampered ${tamper.key}', () {
      final payload = _payload();
      tamper.value(payload);
      expect(
        _map(payload).content.promotionBoardAvailability,
        ReaderSummaryPromotionBoardAvailability.unavailable,
      );
    });
  }

  for (final entry in <String, String>{
    'schemaVersion': 'reader_post_promotion_attestation.v99',
    'policyVersion': 'reader_post_promotion.v99',
    'digestVersion': 'reader_post_promotion_digest.sha256.v99',
  }.entries) {
    test('rejects unknown outer-only ${entry.key}', () {
      final payload = _payload();
      final attestation = _transportAttestation(payload);
      attestation[entry.key] = entry.value;
      expect(
        _map(payload).content.promotionBoardAvailability,
        ReaderSummaryPromotionBoardAvailability.unavailable,
      );
    });

    test('rejects canonical-only ${entry.key} tampering', () {
      final payload = _payload();
      _reseal(payload, 0, (body) => body[entry.key] = entry.value);
      final attestation = _transportAttestation(payload);
      attestation[entry.key] = <String, String>{
        'schemaVersion': 'reader_post_promotion_attestation.v3',
        'policyVersion': 'reader_promotion.2026-11-01',
        'digestVersion': 'reader_post_promotion_digest.sha256.v3',
      }[entry.key];
      expect(
        _map(payload).content.promotionBoardAvailability,
        ReaderSummaryPromotionBoardAvailability.unavailable,
      );
    });
  }

  test('rejects a missing outer V3 ingestion cutoff', () {
    final payload = _payload();
    _transportAttestation(payload).remove('ingestionCutoff');
    expect(
      _map(payload).content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
  });
}

List<Map<String, dynamic>> _newsCards(Map<String, dynamic> payload) =>
    ((payload['readerBrief']!
                as Map<String, dynamic>)['newsWithoutRatingPosts']!
            as List<dynamic>)
        .cast<Map<String, dynamic>>();

Map<String, dynamic> _transportAttestation(Map<String, dynamic> payload) =>
    _newsCards(payload).first['promotionAttestation']! as Map<String, dynamic>;

ReaderSummary _map(Map<String, dynamic> payload) {
  return const SummaryMapper().readerSummaryToDomain(_api(payload));
}

ReaderSummaryApiDto _api(Map<String, dynamic> payload) {
  final dto = generated.ReaderSummaryArtifactResponseDto.fromJson(payload);
  return const GeneratedSummaryRestMapper().readerSummary(dto);
}

// The PostgreSQL fixture gate generates this encoded Dart constant from the
// exact canonical JSON bytes that it also checks into the JSON fixture.
Map<String, dynamic> _payload() =>
    jsonDecode(
          utf8.decode(base64Decode(readerPostPromotionV3SqlReadbackJsonBase64)),
        )
        as Map<String, dynamic>;

void _reseal(
  Map<String, dynamic> payload,
  int index,
  void Function(Map<String, dynamic>) mutate,
) {
  final attestation =
      _newsCards(payload)[index]['promotionAttestation']
          as Map<String, dynamic>;
  final body =
      jsonDecode(attestation['canonicalPayload'] as String)
          as Map<String, dynamic>;
  mutate(body);
  final canonical = _canonical(body);
  attestation
    ..addAll(body)
    ..['canonicalPayload'] = canonical
    ..['digest'] = sha256.convert(utf8.encode(canonical)).toString();
}

String _canonical(Object? value) => jsonEncode(_canonicalValue(value));

Object? _canonicalValue(Object? value) {
  if (value is List<Object?>) return value.map(_canonicalValue).toList();
  if (value is Map<String, Object?>) {
    final keys = value.keys.toList()..sort();
    return {for (final key in keys) key: _canonicalValue(value[key])};
  }
  if (value is Map<String, dynamic>) {
    final keys = value.keys.toList()..sort();
    return {for (final key in keys) key: _canonicalValue(value[key])};
  }
  return value;
}
