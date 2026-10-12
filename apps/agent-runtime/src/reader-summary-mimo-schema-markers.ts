const artifactRoot = ["headline", "executiveSummary", "narrativeSections", "content", "topStories", "interestHighlights", "repeatedSignals", "risksAndUnknowns", "citationMap", "qualityFlags", "confidence", "noSignalReason"];
export const mimoSchemaMarkers: Readonly<Record<string, readonly [string, string, readonly string[]]>> = Object.freeze({
  "social_monitor.reader_summary.promotion_presentation.v3": ["social_monitor_reader_post_presentation_v3", "reader_post_presentation.v3", ["presentations"]],
  "social_monitor.reader_summary.generate.v2": ["social_monitor_reader_summary_artifact", "reader_summary.artifact.v1", artifactRoot],
  "social_monitor.reader_summary.repair.v2": ["social_monitor_reader_summary_artifact", "reader_summary.artifact.v1", artifactRoot],
  "social_monitor.reader_summary.topic_map.label.v2": ["social_monitor_reader_summary_topic_map_labels", "reader_summary.topic_map.v1", ["nodeLabels", "groups"]],
  "social_monitor.reader_summary.topic_map.verify_relations.v2": ["social_monitor_reader_summary_topic_relations", "reader_summary.topic_relation.v1", ["decisions"]],
  "social_monitor.reader_summary.verify_story_relations.v2": ["social_monitor_reader_summary_story_relations", "reader_summary.story_relation.v1", ["decisions"]],
  "social_monitor.reader_summary.verify_related_topic_relations.v2": ["social_monitor_reader_summary_related_topic_relations", "reader_summary.related_topic_relation.v1", ["decisions"]],
});
