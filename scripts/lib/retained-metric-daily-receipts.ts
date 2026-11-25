import { SecureMetricRefreshReceipts } from "./retained-metric-refresh-receipts";
import type { MetricDailyDate } from "@social-monitor/ingestion/domain/policies/retained-metric-daily-grant";
export function retainedMetricDailyReceipts(date: MetricDailyDate, assertMaintenanceHeld: () => void) {
  return {
    predecessor: new SecureMetricRefreshReceipts(assertMaintenanceHeld),
    spent: new SecureMetricRefreshReceipts(assertMaintenanceHeld, undefined, undefined, "renewal"),
    renewal: new SecureMetricRefreshReceipts(assertMaintenanceHeld, undefined, undefined, date),
  };
}
