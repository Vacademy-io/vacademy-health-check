import { useLoggedFailures } from "@/services/external-apis-api";
import type { AlertSourceState } from "./alerts";
import { EXTERNAL_APIS_SOURCE, failureToAlert } from "./external-api-items";

/** A week back: a weekend's failures are still there on Monday. */
const EXTERNAL_API_HOURS = 168;

/** Failed calls to integrated vendors, the same rows as "Needs attention" on External APIs. */
function useExternalApiAlerts(): AlertSourceState {
  const failures = useLoggedFailures(EXTERNAL_API_HOURS);
  return {
    key: EXTERNAL_APIS_SOURCE,
    label: "External API failures",
    href: "/external-apis",
    window: "last 7 days",
    items: (failures.data ?? []).map(failureToAlert),
    isLoading: failures.isLoading,
    isError: failures.isError,
  };
}

/**
 * Every source the bell shows, in display order. To add one, write a hook that returns an
 * AlertSourceState and call it here.
 */
export function useAlertSources(): AlertSourceState[] {
  const externalApis = useExternalApiAlerts();
  return [externalApis];
}
