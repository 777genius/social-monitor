// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart' hide Headers;
import 'package:retrofit/retrofit.dart';
import 'package:retrofit/error_logger.dart';

import '../models/plan_interest_coverage_request_dto.dart';
import '../models/plan_interest_coverage_response_dto.dart';

part 'interest_coverage_plans_client.g.dart';

@RestApi()
abstract class InterestCoveragePlansClient {
  factory InterestCoveragePlansClient(Dio dio, {String? baseUrl}) =
      _InterestCoveragePlansClient;

  /// Plan production-safe source bindings for an interest.
  ///
  /// [authorization] - Optional Bearer API key. Requires read:interests. If supplied, x-workspace-role is not required.
  ///
  /// [xWorkspaceRole] - Comma-separated workspace roles. Source planning reads allow owner, admin, member or viewer. Required when Authorization bearer API key is not supplied.
  ///
  /// [body] - Name not received - field will be skipped.
  @POST('/interests/{interestId}/coverage-plan')
  Future<PlanInterestCoverageResponseDto> interestCoveragePlanControllerPlan({
    @Path('interestId') required String interestId,
    @Header('x-workspace-id') required String xWorkspaceId,
    @Header('x-tenant-id') required String xTenantId,
    @Body() required PlanInterestCoverageRequestDto body,
    @Header('authorization') String? authorization,
    @Header('x-workspace-role') String? xWorkspaceRole,
  });
}
