import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { API_PREFIXES } from "@/lib/constants";

/** One row of platform_product: a product sold under its own name. */
export interface ProductConfig {
  product_key: string;
  display_name: string;
  from_email: string;
  from_name: string;
  website_url: string | null;
  contact_email: string | null;
  theme_color: string | null;
  logo_url: string | null;
  app_path: string;
  login_url: string | null;
  trial_days: number;
  self_signup_enabled: boolean;
  return_hosts: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

const QUERY_KEY = ["super-admin", "products"] as const;

export function useProducts() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.get<ProductConfig[]>(`${API_PREFIXES.ADMIN_CORE}/products`);
      return data;
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (product: ProductConfig) => {
      const { data } = await api.put<ProductConfig>(
        `${API_PREFIXES.ADMIN_CORE}/products/${encodeURIComponent(product.product_key)}`,
        product
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
