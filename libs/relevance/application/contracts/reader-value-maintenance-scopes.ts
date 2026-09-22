import type { ReaderValueDiscoveryScope } from './reader-value-assessment-store';

/** Internal worker enumeration returns IDs only, including revoked scopes needing erasure. */
export interface ReaderValueMaintenanceScopes {
  next(after: ReaderValueDiscoveryScope | undefined): Promise<ReaderValueDiscoveryScope | null>;
}
