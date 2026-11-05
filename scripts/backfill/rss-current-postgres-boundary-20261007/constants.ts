export const HEAD = '8b0c1a7b3210c4b570ee7b449d5752d3ea7ae43d';
export const TREE = 'bb048b1000cf9d99bab4e1804cc072b52e4b9c2d';
export const LOCK = '561561fcf38636330b6d3e5af64d7c2fb673762035d24696ea7ea60965de2016';
export const PG_IMAGE = 'sha256:86c951e05bf56c93d95d397747fb8820ac76cc3bedb78f43abd83eedbe3666ae';
// This is only a base for a NEW image with newly compiled exact accepted source.
export const BASE_IMAGE = 'sha256:42091008b33e9a18b500f77b6cffdb32783581453373d046c9c45cbaee475363';
export const LANE = 'scripts/backfill/rss-current-postgres-boundary-20261007';
export const OUTPUT = '.outputs/rss-current-postgres-boundary-20261007-image420-binding-growth';
export const TABLES = ['tenants', 'workspaces', 'interests', 'source_catalog_entries',
  'capability_profiles', 'source_bindings', 'scan_policies', 'source_items', 'feed_items',
  'scan_attempts', 'scan_leases', 'source_item_engagement_snapshots', 'feed_signal_baseline_samples'] as const;
