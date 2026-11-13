/** One paid plan a product's website shows. */
export interface ProductPlan {
  /** Short id used in sign-up links, like starter. */
  key: string;
  name: string;
  price_inr: number;
  credits: number;
  users: number;
}

/** Starts with a letter and fits the storefront plan key "<product>_<id>" (ai_service, product plans). */
const PLAN_KEY = /^[a-z][a-z0-9-]{0,22}$/;
export const MAX_PLANS = 6;
const MAX_NUMBER = 10_000_000;

const whole = (n: number, min: number) => Number.isInteger(n) && n >= min && n <= MAX_NUMBER;

/** Why the plans cannot be saved, or null. Same rules as the server. */
export function plansProblem(
  plans: ProductPlan[] | null | undefined,
  months: number | null | undefined,
  extra: number | null | undefined
): string | null {
  const list = plans ?? [];
  if (list.length > MAX_PLANS) return `At most ${MAX_PLANS} plans.`;
  const keys = new Set<string>();
  for (const p of list) {
    if (!PLAN_KEY.test(p.key.trim()))
      return "Plan id: up to 23 small letters, numbers or -, starting with a letter, like starter.";
    if (keys.has(p.key.trim())) return `Two plans have the id ${p.key.trim()}.`;
    keys.add(p.key.trim());
    if (!p.name.trim() || p.name.trim().length > 40) return "Every plan needs a name of up to 40 characters.";
    if (!whole(p.price_inr, 0)) return "Plan price must be a whole number of rupees.";
    if (!whole(p.credits, 0)) return "Plan credits must be a whole number.";
    if (!whole(p.users, 1)) return "Plan users must be at least 1.";
  }
  if (months != null && !(Number.isInteger(months) && months >= 1 && months <= 60))
    return "Plan validity must be 1 to 60 months.";
  if (extra != null && !(extra >= 0 && extra <= 1000)) return "Extra credit price must be 0 to 1000.";
  return null;
}

/** A product plan as the storefront sells it (GET /plans/products/{product} on ai-service). */
export interface SoldPlan {
  plan_id: string;
  plan_key: string;
  /** The website id: plan_key without "<product>_". */
  key: string;
  name: string;
  listed: boolean;
  audience_mode: string | null;
  /** Offered to the product's segment (every institute of the product). */
  offered: boolean;
  published: {
    version_id: string;
    version_no: number;
    currency: string;
    price_inr: number;
    credits: number;
    period_months: number;
    is_tax_inclusive: boolean;
    features: string[];
  } | null;
}

export type SaleState = "on_sale" | "differs" | "not_on_sale";

/** The storefront plan of a website plan ("-" in website ids becomes "_" in plan keys). */
export const soldFor = (plan: ProductPlan, sold: SoldPlan[] | null | undefined) =>
  (sold ?? []).find((s) => s.key === plan.key.trim().toLowerCase().replace(/-/g, "_"));

/** Whether buyers pay what the form says: on sale at these numbers, on sale at others, or not on sale. */
export function saleState(plan: ProductPlan, sold: SoldPlan | undefined, months: number | null | undefined): SaleState {
  const v = sold?.published;
  if (!sold || !v || !sold.listed || !sold.offered) return "not_on_sale";
  const same =
    v.currency === "INR" &&
    !v.is_tax_inclusive &&
    v.price_inr === plan.price_inr &&
    v.credits === plan.credits &&
    v.period_months === (months ?? 12) &&
    sold.name === plan.name.trim();
  return same ? "on_sale" : "differs";
}

/** True when saving the form would change what the storefront sells (a plan to add, change or stop). */
export function plansNeedSync(
  plans: ProductPlan[] | null | undefined,
  sold: SoldPlan[] | null | undefined,
  months: number | null | undefined
): boolean {
  const list = plans ?? [];
  if (list.some((p) => saleState(p, soldFor(p, sold), months) !== "on_sale")) return true;
  const keys = new Set(list.map((p) => p.key.trim().toLowerCase().replace(/-/g, "_")));
  return (sold ?? []).some((s) => s.listed && !keys.has(s.key));
}

/** Plans the storefront does not sell yet: they need the features their credits pay for. */
export const newPlans = (plans: ProductPlan[] | null | undefined, sold: SoldPlan[] | null | undefined) =>
  (plans ?? []).filter((p) => !soldFor(p, sold)?.published);

/** Rupees per credit of the smallest active INR credit pack (what an extra credit really costs), or null. */
export function packCreditPrice(
  packs: { credits: number; is_active: boolean; prices: { currency: string; amount_minor: number }[] }[] | null | undefined
): number | null {
  const inr = (packs ?? [])
    .filter((p) => p.is_active && p.credits > 0)
    .map((p) => ({ credits: p.credits, minor: p.prices.find((x) => x.currency === "INR")?.amount_minor }))
    .filter((p): p is { credits: number; minor: number } => typeof p.minor === "number")
    .sort((a, b) => a.credits - b.credits);
  return inr.length ? Math.round((inr[0].minor / inr[0].credits)) / 100 : null;
}
