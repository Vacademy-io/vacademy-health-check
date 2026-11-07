export const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toFixed(n !== 0 && n < 0.01 ? 6 : 2)}`;

export const credits = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const count = (n: number | null | undefined) => Number(n ?? 0).toLocaleString();

export const dateTime = (v: string) => new Date(v).toLocaleString();

const VENDOR_NAMES: Record<string, string> = {
  openrouter: "OpenRouter",
  isoquant: "Isoquant",
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
  google: "Google",
  sarvam: "Sarvam",
  smallest: "Smallest.ai",
  fal: "fal.ai",
  runpod: "RunPod",
  serper: "Serper",
  plivo: "Plivo",
  exotel: "Exotel",
  airtel: "Airtel",
  aavtaar: "Aavtaar",
  razorpay: "Razorpay",
  stripe: "Stripe",
  phonepe: "PhonePe",
  cashfree: "Cashfree",
  eway: "Eway",
  paypal: "PayPal",
  whatsapp: "WhatsApp",
  email: "Email",
  voice_bot: "Voice bot stack",
  speech: "Speech vendor",
  stock_media: "Pexels, Pixabay",
};

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** Prefix on vendor values the query derived from the model name, because no route was recorded. */
export const MODEL_VENDOR_PREFIX = "model:";
/** Prefix on vendors worked out from the route map or the feature, not recorded on the call. */
export const LIKELY_VENDOR_PREFIX = "likely:";
export const NO_VENDOR = "none";

/** A vendor as people call it. Hosts stay as they are, since they are already precise. */
export const vendorName = (raw: string | null | undefined): string => {
  if (!raw || raw === NO_VENDOR || raw === "unknown") return "Vendor not recorded";
  if (raw.startsWith(LIKELY_VENDOR_PREFIX)) {
    return `${vendorName(raw.slice(LIKELY_VENDOR_PREFIX.length))} (likely)`;
  }
  if (raw.startsWith(MODEL_VENDOR_PREFIX)) {
    return `${vendorName(raw.slice(MODEL_VENDOR_PREFIX.length))} model, route not recorded`;
  }
  const known = VENDOR_NAMES[raw.toLowerCase()];
  if (known) return known;
  return /^[A-Z_]+$/.test(raw) ? raw.split("_").map(titleCase).join(" ") : raw;
};

const SOURCE_LABELS: Record<string, string> = {
  ai: "AI call",
  calls: "Logged vendor call",
  telephony: "Telephony",
  payments: "Payment",
  webhooks: "Webhook",
};

/** Which table a call came from, in words. */
export const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? humanize(source);

/** NO_ANSWER and course_generation become readable. "POST /v1/x" and the like are left alone. */
export const humanize = (raw: string | null | undefined): string => {
  if (!raw) return "—";
  if (!/^[A-Za-z0-9_]+$/.test(raw) || (!raw.includes("_") && raw !== raw.toUpperCase())) return raw;
  const text = raw.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const CHARGE_LABELS: Record<string, string> = {
  POSTED: "Charged",
  DROPPED_INSUFFICIENT: "Not charged: out of credits",
  SKIPPED_NO_INSTITUTE: "Not charged: no institute",
  NOT_APPLICABLE: "Free",
  REFUNDED: "Refunded",
  PARTIAL_REFUND: "Partly refunded",
};

export const chargeLabel = (status: string) => CHARGE_LABELS[status] ?? humanize(status);

export const windowLabel = (hours: number) => {
  if (hours === 1) return "the last hour";
  if (hours < 48) return `the last ${hours} hours`;
  return `the last ${Math.round(hours / 24)} days`;
};

/** What went wrong and what to do about it, in words someone can act on. */
export const explainError = (error: unknown): string => {
  const e = error as {
    code?: string;
    response?: { status?: number; data?: unknown };
  };
  const status = e?.response?.status;
  const data = e?.response?.data as { error?: unknown; detail?: unknown; message?: unknown } | undefined;
  const raw = [data?.error, data?.detail, data?.message].find((v) => typeof v === "string") as string | undefined;
  const said = raw && raw.length <= 200 ? ` The server said: ${raw}` : "";

  if (status == null) {
    return e?.code === "ECONNABORTED"
      ? "The server took too long to answer. Try a shorter time range."
      : "Could not reach the server. Check your connection and try again.";
  }
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) {
    return "This account is not allowed to see this. Ask for your user ID to be added to SUPER_ADMIN_USER_IDS.";
  }
  if (status === 404) return `This is not on the server yet, or the record no longer exists.${said}`;
  if (status === 408 || status === 504) return "This took too long to load. Try a shorter time range.";
  if (raw && /does not exist/i.test(raw)) {
    return "A database table this needs is not there yet, so the latest database migration may not have run.";
  }
  if (status >= 500) return `The server hit an error (${status}). Try again, and check the service logs if it keeps happening.${said}`;
  return `The request was refused (${status}).${said}`;
};

/** Filter options from what is on screen, keeping the active filter when no row matches it. */
export const optionsFrom = (values: Array<string | null | undefined>, selected?: string) =>
  [...new Set([...values, selected].filter((v): v is string => !!v))].sort();
