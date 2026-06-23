// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'source_profile_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SourceProfileDto _$SourceProfileDtoFromJson(Map<String, dynamic> json) =>
    SourceProfileDto(
      acquisitionMode: json['acquisitionMode'] as String,
      cursorModel: json['cursorModel'] as String,
      limitations: (json['limitations'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      liveBetaBlockers: (json['liveBetaBlockers'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      productionSafe: json['productionSafe'] as bool,
      providerKey: json['providerKey'] as String,
      quotaModel: json['quotaModel'] as String,
      readinessState: SourceProfileDtoReadinessStateReadinessState.fromJson(
        json['readinessState'] as String,
      ),
      runtimeReadiness:
          SourceProfileDtoRuntimeReadinessRuntimeReadiness.fromJson(
            json['runtimeReadiness'] as String,
          ),
      supportedContentUnits: (json['supportedContentUnits'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      supportedQueryModes: (json['supportedQueryModes'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      capabilityVersion: json['capabilityVersion'] as num?,
      displayName: json['displayName'] as String?,
    );

Map<String, dynamic> _$SourceProfileDtoToJson(SourceProfileDto instance) =>
    <String, dynamic>{
      'acquisitionMode': instance.acquisitionMode,
      'capabilityVersion': instance.capabilityVersion,
      'cursorModel': instance.cursorModel,
      'displayName': instance.displayName,
      'limitations': instance.limitations,
      'liveBetaBlockers': instance.liveBetaBlockers,
      'productionSafe': instance.productionSafe,
      'providerKey': instance.providerKey,
      'quotaModel': instance.quotaModel,
      'readinessState': instance.readinessState,
      'runtimeReadiness': instance.runtimeReadiness,
      'supportedContentUnits': instance.supportedContentUnits,
      'supportedQueryModes': instance.supportedQueryModes,
    };
