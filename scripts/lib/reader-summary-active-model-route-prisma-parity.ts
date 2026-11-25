export const readerSummaryActiveModelRouteParityModel = `
model ReaderSummaryDailyCanonicalRecoveryV4RouteAuthorityMigrationParity {
  tenantId String @map("tenant_id") @db.Uuid
  workspaceId String @map("workspace_id") @db.Uuid
  legacyPlanSha256 String @map("legacy_plan_sha256") @db.Char(64)
  canonicalRecord Json @map("canonical_record")
  canonicalBytes Bytes @map("canonical_bytes")
  canonicalSha256 String @map("canonical_sha256") @db.Char(64)
  adoptedAt DateTime @map("adopted_at") @db.Timestamptz(6)
  @@id([tenantId, workspaceId], map: "rs_daily_v4_route_authorities_pkey")
  @@map("reader_summary_daily_canonical_recovery_v4_route_authorities")
}
`;
