// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;

import 'clients/briefings_client.dart';
import 'clients/feed_client.dart';
import 'clients/scan_requests_client.dart';
import 'clients/scan_policies_client.dart';
import 'clients/sources_client.dart';
import 'clients/summaries_client.dart';
import 'clients/topics_client.dart';
import 'clients/source_bindings_client.dart';

/// Social Monitor API `v0.1.0`.
///
/// Backend/API-first social monitoring MVP.
class SocialMonitorRestClient {
  SocialMonitorRestClient(Dio dio, {String? baseUrl})
    : _dio = dio,
      _baseUrl = baseUrl;

  final Dio _dio;
  final String? _baseUrl;

  static String get version => '0.1.0';

  BriefingsClient? _briefings;
  FeedClient? _feed;
  ScanRequestsClient? _scanRequests;
  ScanPoliciesClient? _scanPolicies;
  SourcesClient? _sources;
  SummariesClient? _summaries;
  TopicsClient? _topics;
  SourceBindingsClient? _sourceBindings;

  BriefingsClient get briefings =>
      _briefings ??= BriefingsClient(_dio, baseUrl: _baseUrl);

  FeedClient get feed => _feed ??= FeedClient(_dio, baseUrl: _baseUrl);

  ScanRequestsClient get scanRequests =>
      _scanRequests ??= ScanRequestsClient(_dio, baseUrl: _baseUrl);

  ScanPoliciesClient get scanPolicies =>
      _scanPolicies ??= ScanPoliciesClient(_dio, baseUrl: _baseUrl);

  SourcesClient get sources =>
      _sources ??= SourcesClient(_dio, baseUrl: _baseUrl);

  SummariesClient get summaries =>
      _summaries ??= SummariesClient(_dio, baseUrl: _baseUrl);

  TopicsClient get topics => _topics ??= TopicsClient(_dio, baseUrl: _baseUrl);

  SourceBindingsClient get sourceBindings =>
      _sourceBindings ??= SourceBindingsClient(_dio, baseUrl: _baseUrl);
}
