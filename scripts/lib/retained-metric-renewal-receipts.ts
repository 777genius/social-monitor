import { SecureMetricRefreshReceipts } from "./retained-metric-refresh-receipts";

export function retainedMetricRenewalReceipts(assertMaintenanceHeld: () => void) {
  return {
    predecessor: new SecureMetricRefreshReceipts(assertMaintenanceHeld),
    renewal: new SecureMetricRefreshReceipts(assertMaintenanceHeld, undefined, undefined, "renewal"),
  };
}
