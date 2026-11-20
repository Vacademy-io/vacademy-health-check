// External API failures as bell alerts. Imports only test-loadable files.
import type { AlertItem } from "./alerts.ts";
import { failureHint } from "../external-apis/attention.ts";
import { vendorName } from "../external-apis/format.ts";

export const EXTERNAL_APIS_SOURCE = "external-apis";

/** One kind of failure: vendor + status code, or vendor + the vendor's words when there is none. */
export interface FailureKind {
  vendor: string;
  http_status: number | null;
  reason: string;
  failed: number;
  last_at: string;
}

/** What a kind failed with: the status code, or the vendor's own words. */
export const failureLabel = (f: Pick<FailureKind, "http_status" | "reason">): string =>
  f.http_status != null ? `HTTP ${f.http_status}` : f.reason.trim() || "No answer";

export const failureToAlert = (f: FailureKind): AlertItem => ({
  key: `${EXTERNAL_APIS_SOURCE}|${f.vendor}|${f.http_status ?? ""}|${f.http_status != null ? "" : f.reason.trim()}`,
  source: EXTERNAL_APIS_SOURCE,
  title: vendorName(f.vendor),
  detail: failureLabel(f),
  hint: failureHint(f.http_status, f.reason),
  count: f.failed,
  lastAt: f.last_at,
});
