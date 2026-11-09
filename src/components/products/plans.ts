/** One paid plan a product's website shows. */
export interface ProductPlan {
  /** Short id used in sign-up links, like starter. */
  key: string;
  name: string;
  price_inr: number;
  credits: number;
  users: number;
}

const PLAN_KEY = /^[a-z0-9-]{1,30}$/;
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
    if (!PLAN_KEY.test(p.key.trim())) return "Plan id: small letters, numbers or -, like starter.";
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
