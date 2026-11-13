import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";
import { isNotFound } from "@/lib/model-defaults";
import type { SoldPlan } from "@/components/products/plans";

/**
 * A product's website plans on the AI-plan storefront (ai-service plans_admin, "product plans"):
 * GET what is on sale, PUT the Pricing form so the storefront sells exactly that, in one transaction.
 */
export interface ProductStorefront {
  product: string;
  /** Every institute of the product is in it ("product_<key>"). */
  segment: string;
  plans: SoldPlan[];
  storefront: { mode: string; payments_enabled: boolean; open_to_segment: boolean };
  changes?: { plan_key: string | null; change: string; version_no?: number }[];
}

export interface ProductPlansPut {
  plans: { key: string; name: string; price_inr: number; credits: number }[];
  period_months: number;
  /** Features a new plan's credits pay for; plans already on sale keep theirs. */
  allowance_features: string[];
  /** Subscribers move to the new price at their next renewal (else they keep theirs). */
  migrate_existing_at_renewal: boolean;
  reason: string;
}

const path = (key: string) => `${API_PREFIXES.AI}/plans/products/${encodeURIComponent(key)}`;
const queryKey = (key: string) => ["super-admin", "product-storefront", key] as const;
const status = (err: unknown) => (err as { response?: { status?: number } } | null)?.response?.status;

/** null data = this ai-service has no product plans endpoint yet (404). */
export function useProductStorefront(productKey: string) {
  return useQuery({
    queryKey: queryKey(productKey),
    queryFn: async (): Promise<ProductStorefront | null> => {
      try {
        return (await api.get<ProductStorefront>(path(productKey))).data;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    retry: (count, err) => status(err) !== 403 && count < 1,
  });
}

export function useSyncProductPlans(productKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProductPlansPut): Promise<ProductStorefront> =>
      (await api.put<ProductStorefront>(path(productKey), body)).data,
    onSuccess: (data) => {
      qc.setQueryData(queryKey(productKey), data);
      qc.invalidateQueries({ queryKey: ["super-admin", "ai-plans"] });
    },
  });
}
