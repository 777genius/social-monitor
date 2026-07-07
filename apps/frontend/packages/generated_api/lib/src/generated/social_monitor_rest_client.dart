// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;

import 'clients/auth_client.dart';
import 'clients/feed_client.dart';
import 'clients/interests_client.dart';
import 'clients/interest_coverage_plans_client.dart';
import 'clients/source_bindings_client.dart';
import 'clients/summaries_client.dart';
import 'clients/user_summary_preferences_client.dart';
import 'clients/reader_summaries_client.dart';
import 'clients/relevance_client.dart';
import 'clients/scan_requests_client.dart';
import 'clients/scan_policies_client.dart';
import 'clients/source_credentials_client.dart';
import 'clients/sources_client.dart';
import 'clients/workspace_settings_client.dart';

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

  AuthClient? _auth;
  FeedClient? _feed;
  InterestsClient? _interests;
  InterestCoveragePlansClient? _interestCoveragePlans;
  SourceBindingsClient? _sourceBindings;
  SummariesClient? _summaries;
  UserSummaryPreferencesClient? _userSummaryPreferences;
  ReaderSummariesClient? _readerSummaries;
  RelevanceClient? _relevance;
  ScanRequestsClient? _scanRequests;
  ScanPoliciesClient? _scanPolicies;
  SourceCredentialsClient? _sourceCredentials;
  SourcesClient? _sources;
  WorkspaceSettingsClient? _workspaceSettings;

  AuthClient get auth => _auth ??= AuthClient(_dio, baseUrl: _baseUrl);

  FeedClient get feed => _feed ??= FeedClient(_dio, baseUrl: _baseUrl);

  InterestsClient get interests =>
      _interests ??= InterestsClient(_dio, baseUrl: _baseUrl);

  InterestCoveragePlansClient get interestCoveragePlans =>
      _interestCoveragePlans ??= InterestCoveragePlansClient(
        _dio,
        baseUrl: _baseUrl,
      );

  SourceBindingsClient get sourceBindings =>
      _sourceBindings ??= SourceBindingsClient(_dio, baseUrl: _baseUrl);

  SummariesClient get summaries =>
      _summaries ??= SummariesClient(_dio, baseUrl: _baseUrl);

  UserSummaryPreferencesClient get userSummaryPreferences =>
      _userSummaryPreferences ??= UserSummaryPreferencesClient(
        _dio,
        baseUrl: _baseUrl,
      );

  ReaderSummariesClient get readerSummaries =>
      _readerSummaries ??= ReaderSummariesClient(_dio, baseUrl: _baseUrl);

  RelevanceClient get relevance =>
      _relevance ??= RelevanceClient(_dio, baseUrl: _baseUrl);

  ScanRequestsClient get scanRequests =>
      _scanRequests ??= ScanRequestsClient(_dio, baseUrl: _baseUrl);

  ScanPoliciesClient get scanPolicies =>
      _scanPolicies ??= ScanPoliciesClient(_dio, baseUrl: _baseUrl);

  SourceCredentialsClient get sourceCredentials =>
      _sourceCredentials ??= SourceCredentialsClient(_dio, baseUrl: _baseUrl);

  SourcesClient get sources =>
      _sources ??= SourcesClient(_dio, baseUrl: _baseUrl);

  WorkspaceSettingsClient get workspaceSettings =>
      _workspaceSettings ??= WorkspaceSettingsClient(_dio, baseUrl: _baseUrl);
}
