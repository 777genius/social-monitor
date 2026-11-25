// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_posts_page_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderPostsPageDto _$ReaderPostsPageDtoFromJson(Map<String, dynamic> json) =>
    ReaderPostsPageDto(
      items: (json['items'] as List<dynamic>)
          .map((e) => ReaderPostDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      providerKeys: (json['providerKeys'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      total: json['total'] as num,
      nextCursor: json['nextCursor'] as String?,
    );

Map<String, dynamic> _$ReaderPostsPageDtoToJson(ReaderPostsPageDto instance) =>
    <String, dynamic>{
      'items': instance.items,
      'nextCursor': instance.nextCursor,
      'providerKeys': instance.providerKeys,
      'total': instance.total,
    };
